/**
 * Codex CLI runner: a pure, dependency-injected module.
 *
 * This module owns only the process boundary and the JSONL contract for one
 * Codex turn: binary detection, argv construction, spawn, timeout/kill, JSONL
 * parsing, and failure classification. It does not read plugin Config, does not
 * write state, does not evaluate gates, and never touches the filesystem except
 * to inspect a candidate binary, read its `--version` output, and optionally
 * read the `-o/--output-last-message` fallback file.
 *
 * Evidence for the shapes below comes from the spike run against
 * `codex-cli 0.169.0-alpha.11.1` on Windows (see the implementation report).
 */

import { spawn as nodeSpawn } from 'node:child_process'
import { promises as nodeFs } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/** Default per-turn budget. The slow (WebSocket-fallback) path takes ~125 s. */
export const CODEX_DEFAULT_TIMEOUT_MS = 0

/** Hard cap for the stderr tail returned to callers. */
export const CODEX_MAX_STDERR_TAIL = 4_096

/** Common arguments shared by exec and resume (single source of truth). */
export const COMMON_FLAGS = Object.freeze(['--json', '--skip-git-repo-check'])

/** Default total budgets per transport, in milliseconds. */
export const CODEX_TRANSPORT_BUDGETS = Object.freeze({
  auto: 270_000,
  fast: 90_000,
  default: 180_000,
  fastAttempt: 90_000,
  defaultAttempt: 180_000,
})

/**
 * Internal-to-contract error mapping (14 internal codes -> 9 closed codes).
 * Frozen so the tool layer can trust it as the single table.
 */
export const INTERNAL_TO_CONTRACT = Object.freeze({
  'spawn-failed': Object.freeze({ code: 'CODEX_CLI_NOT_FOUND', reason: '' }),
  'spawn-epipe': Object.freeze({ code: 'CODEX_DENIED_BY_CONFIG', reason: 'cli-usage' }),
  timeout: Object.freeze({ code: 'CODEX_TIMEOUT', reason: 'timeout' }),
  cancelled: Object.freeze({ code: 'CODEX_TIMEOUT', reason: 'cancelled' }),
  'turn-failed': Object.freeze({ code: 'CODEX_EXIT_NONZERO', reason: 'turn-failed' }),
  'model-unsupported': Object.freeze({ code: 'CODEX_EXIT_NONZERO', reason: 'turn-failed' }),
  'auth-required': Object.freeze({ code: 'CODEX_EXIT_NONZERO', reason: 'turn-failed' }),
  'resume-not-found': Object.freeze({ code: 'CODEX_RESUME_FAILED', reason: 'resume-not-found' }),
  'cli-usage': Object.freeze({ code: 'CODEX_DENIED_BY_CONFIG', reason: 'cli-usage' }),
  'config-invalid': Object.freeze({ code: 'CODEX_DENIED_BY_CONFIG', reason: 'cli-usage' }),
  'sandbox-denied': Object.freeze({ code: 'CODEX_DENIED_BY_CONFIG', reason: 'invalid-sandbox' }),
  'no-final-message': Object.freeze({ code: 'CODEX_OUTPUT_UNPARSEABLE', reason: 'no-final-message' }),
  'invalid-jsonl': Object.freeze({ code: 'CODEX_OUTPUT_UNPARSEABLE', reason: 'no-final-message' }),
  'provider-unreachable': Object.freeze({ code: 'CODEX_DENIED_BY_CONFIG', reason: 'provider-unreachable' }),
})

/** Map one internal failure code to `{code, reason}` from the closed table. */
export function internalToContract(code) {
  return INTERNAL_TO_CONTRACT[code] ?? { code: 'CODEX_EXIT_NONZERO', reason: 'turn-failed' }
}

/**
 * Plan one turn's attempts and per-attempt budgets.
 *
 * `timeoutMs` 0/undefined uses the transport defaults; a positive value is the
 * total budget and each attempt is capped by min(fast 90 s / default 180 s,
 * remaining budget).
 */
export function planAttempts(transport, timeoutMs) {
  const mode = transport === 'fast' || transport === 'default' ? transport : 'auto'
  const totalBudget = Number.isFinite(timeoutMs) && Number(timeoutMs) > 0
    ? Math.max(1, Math.floor(Number(timeoutMs)))
    : CODEX_TRANSPORT_BUDGETS[mode]
  if (mode === 'fast') {
    return { totalBudget, attempts: [{ transport: 'fast', timeoutMs: Math.min(CODEX_TRANSPORT_BUDGETS.fastAttempt, totalBudget) }] }
  }
  if (mode === 'default') {
    return { totalBudget, attempts: [{ transport: 'default', timeoutMs: Math.min(CODEX_TRANSPORT_BUDGETS.defaultAttempt, totalBudget) }] }
  }
  const fast = Math.min(CODEX_TRANSPORT_BUDGETS.fastAttempt, totalBudget)
  const fallback = Math.min(CODEX_TRANSPORT_BUDGETS.defaultAttempt, Math.max(0, totalBudget - fast))
  const attempts = [{ transport: 'fast', timeoutMs: fast }]
  if (fallback > 0) attempts.push({ transport: 'default', timeoutMs: fallback })
  return { totalBudget, attempts }
}

const SECRET_ENV = /(_TOKEN|_KEY|_SECRET|_PASSWORD|API_KEY)$/i
const SAFE_ENV = new Set([
  'PATH', 'Path', 'USERPROFILE', 'HOME', 'CODEX_HOME', 'SystemRoot', 'SYSTEMROOT',
  'APPDATA', 'LOCALAPPDATA', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'SHELL', 'LANG',
])

/**
 * Build the child environment: no secrets, only the allow-list needed for the
 * Codex CLI to start and find its login/home.
 */
export function filterChildEnv(env = process.env) {
  const output = {}
  for (const [key, value] of Object.entries(env ?? {})) {
    if (typeof value !== 'string') continue
    if (SECRET_ENV.test(key)) continue
    output[key] = value
  }
  return output
}

// Controlled arguments: these can never be injected through codexExtraArgs.
const FORBIDDEN_EXTRA = new Set([
  '-s', '--sandbox', '--full-auto', '--yolo', '--dangerously-bypass-approvals-and-sandbox',
  '-a', '--ask-for-approval', '-C', '--cd', '--add-dir', '--worktree',
  '-c', '--config', '--json', '-o', '--output-last-message', '-m', '--model',
  '--ignore-user-config', '--ignore-rules', '--ephemeral',
  'exec', 'resume', 'login', '--help', '-h', '--version', '--',
])

const VALUE_FLAGS = new Set([
  '--color', '--enable', '--disable', '--profile', '--thread-source', '--cyber-access-program',
])

/**
 * Validate `codexExtraArgs` before any process is started.
 * Returns `{code:'config-invalid', reason:'forbidden-arg', message}` or undefined.
 */
export function validateExtraArgs(extraArgs) {
  if (extraArgs === undefined || extraArgs === null) return undefined
  if (!Array.isArray(extraArgs)) {
    return { code: 'config-invalid', reason: 'forbidden-arg', message: 'codexExtraArgs must be an array' }
  }
  if (extraArgs.length > 20) {
    return { code: 'config-invalid', reason: 'forbidden-arg', message: 'codexExtraArgs accepts at most 20 entries' }
  }
  for (let index = 0; index < extraArgs.length; index += 1) {
    const token = extraArgs[index]
    if (typeof token !== 'string' || token.length === 0 || token.length > 200) {
      return { code: 'config-invalid', reason: 'forbidden-arg', message: `codexExtraArgs entry #${index + 1} must be a non-empty string of at most 200 characters` }
    }
    if (!token.startsWith('-')) {
      return { code: 'config-invalid', reason: 'forbidden-arg', message: `codexExtraArgs entry "${token}" must start with "-"` }
    }
    const flag = token.includes('=') ? token.slice(0, token.indexOf('=')) : token
    if (FORBIDDEN_EXTRA.has(token) || FORBIDDEN_EXTRA.has(flag)) {
      return { code: 'config-invalid', reason: 'forbidden-arg', message: `codexExtraArgs entry "${flag}" is controlled by the plugin` }
    }
    if (VALUE_FLAGS.has(flag) && !token.includes('=')) {
      return { code: 'config-invalid', reason: 'forbidden-arg', message: `codexExtraArgs value flags must use "--flag=value": "${token}"` }
    }
  }
  return undefined
}

/** Windows package root used by the MSIX installation of Codex. */
export const CODEX_WINDOWS_APPS_ROOT = 'C:\\Program Files\\WindowsApps'

/**
 * The 14 internal failure codes. The later tool layer maps these to the
 * user-facing `CODEX_*` error codes from the contract.
 */
export const CODEX_ERROR_CODES = Object.freeze([
  'spawn-failed',
  'spawn-epipe',
  'timeout',
  'cancelled',
  'turn-failed',
  'model-unsupported',
  'auth-required',
  'resume-not-found',
  'cli-usage',
  'config-invalid',
  'sandbox-denied',
  'no-final-message',
  'invalid-jsonl',
  'provider-unreachable',
])

/**
 * Fast-path provider overrides measured in the spike: HTTP-only transport
 * avoids four WebSocket reconnect timeouts (~120 s) and turns a simple prompt
 * into ~14 s. The built-in `openai` provider cannot be overridden, so this
 * declares a separate provider id that reuses the ChatGPT login.
 */
export const CODEX_FAST_PROVIDER_ARGS = Object.freeze([
  '-c',
  'model_provider="openai-http"',
  '-c',
  'model_providers.openai-http={name="OpenAI HTTP", base_url="https://chatgpt.com/backend-api/codex", wire_api="responses", requires_openai_auth=true, supports_websockets=false, supports_standalone_web_search=false}',
])

const DEFAULT_FS = Object.freeze({
  stat: (file) => nodeFs.stat(file),
  readdir: (dir, options) => nodeFs.readdir(dir, options),
  readFile: (file, encoding) => nodeFs.readFile(file, encoding),
})

const VERSION_PARTS = /^(\d+(?:\.\d+)*)$/
const PACKAGE_DIR = /^OpenAI\.Codex_(\d+(?:\.\d+)*)_[A-Za-z0-9]+__/

/** Compare dotted numeric versions; returns a positive number when a > b. */
export function compareVersions(left, right) {
  const leftParts = String(left).split('.')
  const rightParts = String(right).split('.')
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const a = Number.parseInt(leftParts[index] ?? '0', 10)
    const b = Number.parseInt(rightParts[index] ?? '0', 10)
    if (a !== b) return a - b
  }
  return 0
}

/** Extract the version segment from an `OpenAI.Codex_<version>_...` directory. */
export function versionFromPackageDir(name) {
  const match = PACKAGE_DIR.exec(String(name ?? ''))
  return match === null ? '' : match[1]
}

function trimMaybe(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isExecutableCandidate(stat) {
  if (stat === undefined || stat === null) return false
  if (typeof stat.isFile === 'function' && stat.isFile() !== true) return false
  return Number(stat.size) > 0
}

/**
 * Default `--version` probe. Runs the candidate binary once with a hard budget
 * so a dead/blocked alias can never stall detection.
 *
 * @param binary - absolute candidate path.
 * @param spawnFn - spawn-compatible function.
 * @returns `{ok, version, reason}`.
 */
export function probeCodexVersion(binary, spawnFn = nodeSpawn, timeoutMs = 8_000) {
  return new Promise((resolve) => {
    let stdout = ''
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    let child
    try {
      child = spawnFn(binary, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (error) {
      finish({ ok: false, version: '', reason: error?.message ?? 'spawn failed' })
      return
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
      finish({ ok: false, version: '', reason: 'version probe timed out' })
    }, timeoutMs)
    timer?.unref?.()
    child.on('error', (error) => {
      clearTimeout(timer)
      finish({ ok: false, version: '', reason: error?.message ?? 'version probe failed' })
    })
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        finish({ ok: false, version: '', reason: `version probe exited ${code}` })
        return
      }
      const match = /codex-cli\s+([0-9][^\s]*)/i.exec(stdout)
      finish({
        ok: true,
        version: match === null ? '' : match[1],
      })
    })
  })
}

/** Default `Get-AppxPackage` fallback for a locked-down WindowsApps directory. */
function defaultAppxLookup(spawnFn, timeoutMs = 12_000) {
  return new Promise((resolve) => {
    let stdout = ''
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    let child
    try {
      child = spawnFn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "(Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -First 1).InstallLocation",
      ], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    } catch {
      finish('')
      return
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
      finish('')
    }, timeoutMs)
    timer?.unref?.()
    child.on('error', () => { clearTimeout(timer); finish('') })
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.on('close', () => {
      clearTimeout(timer)
      const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      finish(lines.length === 0 ? '' : lines[lines.length - 1])
    })
  })
}

function pathDirectoryList(env, platform, home) {
  const separator = platform === 'win32' ? ';' : ':'
  const fromPath = String(env.PATH ?? env.Path ?? '')
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean)
  const extra = []
  if (platform === 'win32') {
    if (trimMaybe(env.APPDATA) !== '') extra.push(path.join(env.APPDATA, 'npm'))
  }
  extra.push(path.join(home, '.local', 'bin'))
  return [...new Set([...fromPath, ...extra])]
}

function candidateNames(platform) {
  // A `.cmd` shim cannot be spawned without a shell, so selecting it would
  // produce a broken runner. Only real executables are candidates.
  return platform === 'win32' ? ['codex.exe'] : ['codex']
}

/**
 * Resolve the Codex executable in five fixed levels:
 * configured path, `CODEX_CLI_PATH`, WindowsApps package directories (with a
 * `Get-AppxPackage` fallback), PATH, then failure. Zero-byte app-execution
 * aliases are always skipped.
 *
 * @param options - injection points for tests:
 *   `{configuredPath, env, platform, fs, probe, spawnFn, now, windowsAppsRoot,
 *     appxLookup, pathDirs}`.
 * @returns `{path, version, ms, tried}`; `path` is `''` when nothing resolved.
 */
export async function detectCodexBinary(options = {}) {
  const startedAt = (options.now ?? Date.now)()
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const fsImpl = options.fs ?? DEFAULT_FS
  const spawnFn = options.spawnFn ?? nodeSpawn
  const probeOption = options.probe
  const probe = probeOption === false
    ? async () => ({ ok: true, version: '' })
    : probeOption ?? ((candidate) => probeCodexVersion(candidate, spawnFn))
  const appxLookup = options.appxLookup ?? ((fn) => defaultAppxLookup(fn))
  const windowsAppsRoot = options.windowsAppsRoot ?? CODEX_WINDOWS_APPS_ROOT
  const home = options.home ?? homedir()
  const pathDirs = options.pathDirs ?? pathDirectoryList(env, platform, home)
  const tried = []

  const record = (level, candidate, ok, reason = '') => {
    tried.push({ level, path: candidate, ok, ...(reason === '' ? {} : { reason }) })
  }

  const statSafe = async (candidate) => {
    try {
      return await fsImpl.stat(candidate)
    } catch (error) {
      return { error: error?.code ?? error?.message ?? 'stat failed' }
    }
  }

  const accept = async (level, candidate, versionHint = '') => {
    const value = trimMaybe(candidate)
    if (value === '') return undefined
    const stat = await statSafe(value)
    if (stat?.error !== undefined) {
      record(level, value, false, `not accessible (${stat.error})`)
      return undefined
    }
    if (typeof stat.isFile === 'function' && stat.isFile() && stat.size === 0) {
      record(level, value, false, 'zero-byte app-execution alias')
      return undefined
    }
    if (!isExecutableCandidate(stat)) {
      record(level, value, false, 'not an executable file')
      return undefined
    }
    const probed = await probe(value)
    if (probed?.ok !== true) {
      record(level, value, false, probed?.reason ?? 'executable probe failed')
      return undefined
    }
    record(level, value, true)
    return { path: value, version: probeOption === false ? versionHint : (probed.version || versionHint) }
  }

  // Level 1: explicit configuration. Non-empty means no fallback on failure.
  const configured = trimMaybe(options.configuredPath)
  if (configured !== '') {
    const isAbsolute = configured.startsWith('/') || /^[A-Za-z]:[\\/]/.test(configured) || configured.startsWith('\\\\')
    if (configured.length > 1024 || !isAbsolute) {
      record('config', configured, false, 'codexBinary must be an absolute path of at most 1024 characters')
      return {
        path: '',
        version: '',
        ms: Math.max(0, (options.now ?? Date.now)() - startedAt),
        tried,
        hint: 'configure codexBinary manually with an absolute .exe path',
      }
    }
    const accepted = await accept('config', configured)
    return {
      path: accepted?.path ?? '',
      version: accepted?.version ?? '',
      ms: Math.max(0, (options.now ?? Date.now)() - startedAt),
      tried,
      ...(accepted === undefined ? { hint: 'configure codexBinary manually with an absolute .exe path' } : {}),
    }
  }

  // Level 2: CODEX_CLI_PATH (validate, then continue on failure).
  const fromEnv = trimMaybe(env.CODEX_CLI_PATH)
  if (fromEnv !== '') {
    const accepted = await accept('env', fromEnv)
    if (accepted !== undefined) {
      return {
        path: accepted.path,
        version: accepted.version,
        ms: Math.max(0, (options.now ?? Date.now)() - startedAt),
        tried,
      }
    }
  }

  // Level 3: WindowsApps package directories, newest version first.
  if (platform === 'win32') {
    let packageDirs = []
    try {
      const entries = await fsImpl.readdir(windowsAppsRoot, { withFileTypes: true })
      packageDirs = entries
        .filter((entry) => PACKAGE_DIR.test(String(entry.name ?? '')))
        .map((entry) => ({ name: entry.name, version: versionFromPackageDir(entry.name) }))
        .filter((entry) => VERSION_PARTS.test(entry.version))
        .sort((left, right) => compareVersions(right.version, left.version))
    } catch (error) {
      record('windowsapps', windowsAppsRoot, false, `cannot list (${error?.code ?? error?.message ?? 'readdir failed'})`)
      packageDirs = []
    }
    for (const packageDir of packageDirs) {
      const candidate = path.join(windowsAppsRoot, packageDir.name, 'app', 'resources', 'codex.exe')
      const accepted = await accept('windowsapps', candidate, packageDir.version)
      if (accepted !== undefined) {
        return {
          path: accepted.path,
          version: accepted.version || packageDir.version,
          ms: Math.max(0, (options.now ?? Date.now)() - startedAt),
          tried,
        }
      }
    }
    // Get-AppxPackage fallback when the directory is unreadable or stale.
    const installLocation = trimMaybe(await appxLookup(spawnFn))
    if (installLocation !== '') {
      const candidate = path.join(installLocation, 'app', 'resources', 'codex.exe')
      const accepted = await accept('windowsapps-appx', candidate)
      if (accepted !== undefined) {
        return {
          path: accepted.path,
          version: accepted.version,
          ms: Math.max(0, (options.now ?? Date.now)() - startedAt),
          tried,
        }
      }
    } else {
      record('windowsapps-appx', 'Get-AppxPackage -Name OpenAI.Codex', false, 'no InstallLocation')
    }
  }

  // Level 4: PATH and the conventional npm/local install locations.
  const seen = new Set()
  for (const directory of pathDirs) {
    for (const name of candidateNames(platform)) {
      const candidate = path.join(directory, name)
      if (seen.has(candidate)) continue
      seen.add(candidate)
      const accepted = await accept('path', candidate)
      if (accepted !== undefined) {
        return {
          path: accepted.path,
          version: accepted.version,
          ms: Math.max(0, (options.now ?? Date.now)() - startedAt),
          tried,
        }
      }
    }
  }

  // Level 5: nothing resolved.
  return {
    path: '',
    version: '',
    ms: Math.max(0, (options.now ?? Date.now)() - startedAt),
    tried,
  }
}

function pushOptional(argv, flag, value) {
  if (trimMaybe(value) !== '') argv.push(flag, value)
}

/**
 * Build argv for a fresh Codex thread.
 *
 * Order: `exec --json --skip-git-repo-check -C <cwd> [--ignore-user-config]
 * [fast provider overrides] [-s <sandbox>] [-m <model>] [-o <file>]
 * [extraArgs...] <prompt>`.
 */
export function buildExecArgv(options = {}) {
  const argv = ['exec', ...COMMON_FLAGS]
  pushOptional(argv, '-C', options.cwd)
  if (options.ignoreUserConfig !== false) argv.push('--ignore-user-config')
  if (options.transport === 'fast') argv.push(...CODEX_FAST_PROVIDER_ARGS)
  pushOptional(argv, '-s', options.sandbox)
  pushOptional(argv, '-m', options.model)
  pushOptional(argv, '-o', options.outputLastMessage)
  if (Array.isArray(options.extraArgs)) argv.push(...options.extraArgs)
  if (trimMaybe(options.prompt) !== '') argv.push('--', options.prompt)
  return argv
}

/**
 * Build argv for `codex exec resume <threadId>`.
 *
 * Deliberately omits `--cd`, `--sandbox` and `--ask-for-approval`: this Codex
 * version rejects them on resume and the working directory must come from the
 * spawned process's `cwd`.
 */
export function buildResumeArgv(options = {}) {
  const argv = ['exec', 'resume']
  if (trimMaybe(options.threadId) !== '') argv.push(options.threadId)
  argv.push(...COMMON_FLAGS)
  if (options.ignoreUserConfig !== false) argv.push('--ignore-user-config')
  if (options.transport === 'fast') argv.push(...CODEX_FAST_PROVIDER_ARGS)
  pushOptional(argv, '-m', options.model)
  pushOptional(argv, '-o', options.outputLastMessage)
  if (Array.isArray(options.extraArgs)) argv.push(...options.extraArgs)
  if (trimMaybe(options.prompt) !== '') argv.push('--', options.prompt)
  return argv
}

/** Create an incremental JSONL parser; each parsed event is yielded once. */
function createLineParser(onEvent) {
  let buffer = ''
  let malformedLines = 0
  const events = []
  const handle = (line) => {
    const text = line.trim()
    if (text === '') return
    try {
      const event = JSON.parse(text)
      events.push(event)
      onEvent?.(event)
    } catch {
      malformedLines += 1
    }
  }
  return {
    feed(chunk) {
      buffer += chunk
      for (;;) {
        const index = buffer.indexOf('\n')
        if (index < 0) break
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        handle(line)
      }
    },
    flush() {
      if (buffer !== '') handle(buffer)
      buffer = ''
    },
    result: () => ({ events, malformedLines }),
  }
}

function normalizeUsage(usage) {
  if (usage === null || typeof usage !== 'object') return undefined
  return {
    inputTokens: Number(usage.input_tokens ?? 0),
    cachedInputTokens: Number(usage.cached_input_tokens ?? 0),
    outputTokens: Number(usage.output_tokens ?? 0),
    reasoningOutputTokens: Number(usage.reasoning_output_tokens ?? 0),
  }
}

/** Sanitize one command/output preview for the model-visible activity list. */
function activityText(value, max = 4_096) {
  let text = typeof value === 'string' ? value : String(value ?? '')
  text = text.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-<redacted>')
  text = text.replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer <redacted>')
  text = text.replace(/eyJ[A-Za-z0-9._-]{10,}/g, '<jwt>')
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
  if (home !== '') text = text.split(home).join('<home>')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** Make a path relative to cwd; absolute outside paths become `<abs>`. */
function relativeActivityPath(value, cwd) {
  const text = String(value ?? '')
  if (text === '') return text
  const base = trimMaybe(cwd)
  if (base === '') return text
  const normalizedBase = base.endsWith(path.sep) ? base : `${base}${path.sep}`
  if (text.startsWith(normalizedBase)) return text.slice(normalizedBase.length)
  const absolute = text.startsWith('/') || /^[A-Za-z]:[\\/]/.test(text)
  return absolute ? '<abs>' : text
}

function activityForItem(item, cwd) {
  if (item === null || typeof item !== 'object') return undefined
  const status = typeof item.status === 'string' ? item.status : ''
  switch (item.type) {
    case 'command_execution':
      return {
        type: 'command_execution',
        command: activityText(item.command, 1_024),
        exitCode: item.exit_code ?? null,
        outputPreview: activityText(item.aggregated_output ?? ''),
      }
    case 'file_change':
      return {
        type: 'file_change',
        status,
        paths: Array.isArray(item.paths) ? item.paths.map((entry) => relativeActivityPath(entry, cwd)) : [],
      }
    case 'mcp_tool_call':
      return {
        type: 'mcp_tool_call',
        status,
        ...(typeof item.server === 'string' ? { server: item.server } : {}),
        ...(typeof item.tool === 'string' ? { tool: item.tool } : {}),
      }
    case 'web_search':
      return { type: 'web_search', status }
    case 'todo_list':
      return { type: 'todo_list', status }
    default:
      return undefined
  }
}

function summarizeEvents(events, malformedLines, cwd = '') {
  const errors = []
  const diagnostics = []
  const activities = []
  let reconnectEvents = 0
  let threadId = ''
  let text = ''
  let usage
  let turnCompleted = false
  const itemCounts = {}
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue
    switch (event.type) {
      case 'thread.started':
        if (typeof event.thread_id === 'string' && threadId === '') threadId = event.thread_id
        break
      case 'error': {
        const message = String(event.message ?? '')
        errors.push(message)
        if (/^Reconnecting\.\.\.\s*\d+\/\d+/.test(message)) reconnectEvents += 1
        break
      }
      case 'item.completed': {
        const item = event.item ?? {}
        const type = String(item.type ?? '')
        itemCounts[type] = (itemCounts[type] ?? 0) + 1
        if (type === 'agent_message') {
          const value = typeof item.text === 'string' ? item.text.trim() : ''
          if (value !== '') text = value
        } else if (type === 'error') {
          diagnostics.push(String(item.message ?? ''))
        } else {
          const activity = activityForItem(item, cwd)
          if (activity !== undefined) activities.push(activity)
        }
        break
      }
      case 'item.started': {
        const type = String(event.item?.type ?? '')
        itemCounts[`started:${type}`] = (itemCounts[`started:${type}`] ?? 0) + 1
        break
      }
      case 'turn.completed':
        turnCompleted = true
        usage = normalizeUsage(event.usage) ?? usage
        break
      default:
        break
    }
  }
  return {
    threadId,
    text,
    activities,
    usage,
    errors,
    diagnostics,
    reconnectEvents,
    malformedLines,
    turnCompleted,
    itemCounts,
  }
}

/**
 * Parse a complete JSONL stream. Tolerates malformed/partial lines.
 *
 * @param stdout - raw stdout text.
 * @returns `{events, threadId, text, activities, usage, errors, diagnostics,
 *   reconnectEvents, malformedLines, turnCompleted, itemCounts}`.
 */
export function parseJsonl(stdout, options = {}) {
  const parser = createLineParser()
  parser.feed(String(stdout ?? ''))
  parser.flush()
  const { events, malformedLines } = parser.result()
  return { events, ...summarizeEvents(events, malformedLines, options.cwd ?? '') }
}

/** Read the `-o` fallback file without failing the turn. */
async function readLastMessageFile(fsImpl, file) {
  if (trimMaybe(file) === '') return ''
  try {
    const value = await fsImpl.readFile(file, 'utf8')
    return String(value ?? '').trim()
  } catch {
    return ''
  }
}

function messageOf(error) {
  return String(error?.message ?? '')
}

function classifyTurnMessage(message, transportMode) {
  const text = String(message ?? '').toLowerCase()
  if (/not supported when using codex with a chatgpt account|model .* not (found|supported)|unknown model|invalid model/.test(text)) {
    return { code: 'model-unsupported', message }
  }
  if (/not logged in|login required|unauthor|401|authentication|invalid api key/.test(text)) {
    return { code: 'auth-required', message }
  }
  if (/blocked by policy|rejected:.*policy|createprocess.*rejected/.test(text)) {
    return { code: 'sandbox-denied', message }
  }
  if (transportMode === 'fast' && /provider|connection|network|econn|enotfound|socket|timed out|tls|websocket/.test(text)) {
    return { code: 'provider-unreachable', message }
  }
  if (/error loading config|invalid configuration|unknown configuration field/.test(text)) {
    return { code: 'config-invalid', message }
  }
  if (/unexpected argument|error: unexpected|invalid value|missing required argument/.test(text)) {
    return { code: 'cli-usage', message }
  }
  return { code: 'turn-failed', message }
}

/**
 * Classify one failed/empty attempt into one of the 14 internal codes.
 * Priority: spawn error, cancellation, timeout, exit 2, turn.failed, non-zero
 * exit, then parse/result checks. Only `turn.failed.error.message` and the
 * stderr tail drive message matching; full stdout is never scanned.
 */
export function classifyFailure({
  spawnError,
  aborted = false,
  timedOut = false,
  exitCode = null,
  events = [],
  stderr = '',
  transportMode = '',
  resumed = false,
  summary = {},
} = {}) {
  if (spawnError !== undefined && spawnError !== null) {
    const code = String(spawnError.code ?? '')
    const message = messageOf(spawnError)
    if (code === 'EPERM' || code === 'EACCES' || code === 'EPIPE') {
      return { code: 'spawn-epipe', message }
    }
    return { code: 'spawn-failed', message }
  }
  if (aborted) return { code: 'cancelled', message: 'Codex turn was cancelled' }
  if (timedOut) return { code: 'timeout', message: 'Codex turn timed out' }

  const failureMessages = events
    .filter((event) => event?.type === 'turn.failed')
    .map((event) => String(event.error?.message ?? ''))
  const stderrTail = String(stderr ?? '').slice(-CODEX_MAX_STDERR_TAIL)

  if (exitCode === 2) {
    return { code: 'cli-usage', message: limitText(stderrTail) }
  }
  if (resumed && /no rollout found|thread\/resume failed/.test(stderrTail.toLowerCase())) {
    return { code: 'resume-not-found', message: limitText(stderrTail) }
  }

  if (failureMessages.length > 0) {
    return classifyTurnMessage(failureMessages[failureMessages.length - 1], transportMode)
  }

  if (exitCode !== 0) {
    const combined = `${stderrTail}`.toLowerCase()
    if (/no rollout found|thread\/resume failed/.test(combined)) {
      return { code: 'resume-not-found', message: limitText(stderrTail) }
    }
    if (transportMode === 'fast' && /401|403|unauthor|provider|connection|network|econn|enotfound|socket|timed out|tls|websocket/.test(combined)) {
      return { code: 'provider-unreachable', message: limitText(stderrTail) }
    }
    if (/not supported when using codex with a chatgpt account|model .* not (found|supported)|unknown model|invalid model/.test(combined)) {
      return { code: 'model-unsupported', message: limitText(stderrTail) }
    }
    if (/not logged in|login required|unauthor|401|authentication|invalid api key/.test(combined)) {
      return { code: 'auth-required', message: limitText(stderrTail) }
    }
    if (/blocked by policy|rejected:.*policy|createprocess.*rejected/.test(combined)) {
      return { code: 'sandbox-denied', message: limitText(stderrTail) }
    }
    if (/error loading config|invalid configuration|unknown configuration field/.test(combined)) {
      return { code: 'config-invalid', message: limitText(stderrTail) }
    }
    if (/unexpected argument|error: unexpected|invalid value|missing required argument/.test(combined)) {
      return { code: 'cli-usage', message: limitText(stderrTail) }
    }
    return { code: 'turn-failed', message: limitText(stderrTail) }
  }

  if (trimMaybe(summary.text) === '') {
    if (events.length === 0 && trimMaybe(summary.stdout) !== '') {
      return { code: 'invalid-jsonl', message: 'stdout was not valid JSONL' }
    }
    return { code: 'no-final-message', message: 'Codex finished without an agent_message' }
  }
  return undefined
}

function limitText(text) {
  const value = String(text ?? '').trim()
  return value.length > 1_000 ? `${value.slice(0, 1_000)}…` : value
}

/** Terminate one Codex process and its descendants without leaving orphans. */
function terminateChild(child, { killSpawnFn, platform, graceMs, onForce } = {}) {
  if (child === undefined || child === null) return
  const pid = child.pid
  if (!Number.isSafeInteger(pid)) {
    try { child.kill('SIGKILL') } catch { /* already gone */ }
    return
  }
  if (platform === 'win32') {
    try {
      killSpawnFn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } catch {
      // Fall through to the direct kill below.
    }
    try { child.kill('SIGKILL') } catch { /* already gone */ }
    return
  }
  try { child.kill('SIGTERM') } catch { /* already gone */ }
  const timer = setTimeout(() => {
    try {
      const signalled = child.kill('SIGKILL')
      if (signalled === false) onForce?.()
    } catch {
      onForce?.()
    }
  }, graceMs)
  timer?.unref?.()
}

/** Run one spawn attempt under a hard timeout. */
async function runAttempt({
  binary,
  argv,
  cwd,
  timeoutMs,
  env,
  signal,
  spawnFn,
  killSpawnFn,
  platform,
  now,
  onEvent,
  fsImpl,
  outputLastMessage,
  transportMode,
  resumed,
}) {
  const startedAt = now()
  const parser = createLineParser(onEvent)
  let stdout = ''
  let stderr = ''
  let spawnError
  let timedOut = false
  let aborted = false
  let child

  // `-o` is only trusted when it was written after this attempt started.
  if (trimMaybe(outputLastMessage) !== '' && typeof fsImpl.rm === 'function') {
    await fsImpl.rm(outputLastMessage, { force: true }).catch(() => undefined)
  }
  try {
    child = spawnFn(binary, argv, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
  } catch (error) {
    spawnError = error
  }

  let exitCode = null
  let exitSignal = null
  if (child !== undefined) {
    const closed = new Promise((resolve) => {
      child.on('close', (code, closeSignal) => resolve({ code, closeSignal }))
    })
    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stdout += text
      parser.feed(text)
    })
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => { spawnError = error })
    const timer = setTimeout(() => {
      timedOut = true
      terminateChild(child, { killSpawnFn, platform, graceMs: 3_000 })
    }, Math.max(1, timeoutMs))
    timer?.unref?.()
    const onAbort = () => {
      aborted = true
      terminateChild(child, { killSpawnFn, platform, graceMs: 3_000 })
    }
    if (signal !== undefined && signal !== null) {
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    const outcome = await closed
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', onAbort)
    exitCode = outcome.code
    exitSignal = outcome.closeSignal
  }
  parser.flush()
  const { events, malformedLines } = parser.result()
  const summary = summarizeEvents(events, malformedLines, cwd)
  let text = summary.text
  if (text === '' && trimMaybe(outputLastMessage) !== '' && typeof fsImpl.readFile === 'function') {
    try {
      const stat = typeof fsImpl.stat === 'function' ? await fsImpl.stat(outputLastMessage) : undefined
      const fresh = stat === undefined || Number(stat.mtimeMs ?? 0) >= startedAt - 1_000
      if (fresh) {
        const value = await fsImpl.readFile(outputLastMessage, 'utf8')
        text = String(value ?? '').trim()
      }
    } catch {
      // Missing/too-old fallback file is not an error.
    }
    if (typeof fsImpl.rm === 'function') await fsImpl.rm(outputLastMessage, { force: true }).catch(() => undefined)
  }
  const sawEffectiveTurn = summary.threadId !== ''
    || summary.activities.length > 0
    || events.some((event) => event?.type === 'item.started' || event?.type === 'item.completed' || event?.type === 'turn.started')
  const failure = classifyFailure({
    spawnError,
    aborted,
    timedOut,
    exitCode,
    events,
    stderr,
    transportMode,
    resumed,
    summary: { ...summary, text, stdout },
  })
  const warning = summary.threadId === '' ? 'no thread id (this turn cannot be resumed)' : ''
  return {
    ok: failure === undefined,
    text,
    threadId: summary.threadId,
    events,
    activities: summary.activities,
    usage: summary.usage,
    exitCode,
    signal: exitSignal,
    ms: Math.max(0, now() - startedAt),
    failure: failure === undefined
      ? undefined
      : { ...failure, reason: internalToContract(failure.code).reason },
    stderrTail: stderr.slice(-CODEX_MAX_STDERR_TAIL),
    transport: transportMode,
    warning,
    sawEffectiveTurn,
    malformedLines,
  }
}

function isTransportFallback(failure) {
  if (failure === undefined || failure === null) return false
  if (failure.code === 'timeout') return true
  if (failure.code === 'provider-unreachable') {
    return !/401|403|unauthor|auth/i.test(String(failure.message ?? ''))
  }
  return false
}

function failureBeforeStart(code, reason, message, startedAt, now, transport) {
  return {
    ok: false,
    text: '',
    threadId: '',
    events: [],
    activities: [],
    usage: undefined,
    exitCode: null,
    signal: null,
    ms: Math.max(0, now() - startedAt),
    failure: { code, reason, message },
    stderrTail: '',
    transport: transport === 'fast' ? 'fast' : 'default',
    attempts: [],
    warning: '',
    sawEffectiveTurn: false,
  }
}

/**
 * Run one Codex turn with transport planning, fallback, timeout, and parsing.
 *
 * @param options - `{binary, cwd, prompt, sandbox, timeoutMs, resumeThreadId,
 *   model, transport, env, outputLastMessage, extraArgs, signal, spawnFn,
 *   killSpawnFn, platform, now, fs, onEvent}`.
 */
export async function runTask(options = {}) {
  const startedAt = (options.now ?? Date.now)()
  const now = options.now ?? Date.now
  const spawnFn = options.spawnFn ?? nodeSpawn
  const killSpawnFn = options.killSpawnFn ?? nodeSpawn
  const platform = options.platform ?? process.platform
  const fsImpl = options.fs ?? DEFAULT_FS
  const transport = options.transport === 'fast' || options.transport === 'default'
    ? options.transport
    : 'auto'
  const resumeThreadId = trimMaybe(options.resumeThreadId)
  const resumed = resumeThreadId !== ''

  const extraProblem = validateExtraArgs(options.extraArgs)
  if (extraProblem !== undefined) {
    const failure = { code: extraProblem.code, reason: extraProblem.reason, message: extraProblem.message }
    return { ...failureBeforeStart(extraProblem.code, 'forbidden-arg', extraProblem.message, startedAt, now, transport), failure }
  }
  if (trimMaybe(options.sandbox) === '' || !['read-only', 'workspace-write', 'danger-full-access'].includes(options.sandbox)) {
    return failureBeforeStart('config-invalid', 'forbidden-arg', 'sandbox is required and must be read-only, workspace-write, or danger-full-access', startedAt, now, transport)
  }

  const plan = planAttempts(transport, options.timeoutMs)
  const deadline = startedAt + plan.totalBudget
  const attempts = []
  let last
  for (const planned of plan.attempts) {
    const remaining = Math.min(planned.timeoutMs, deadline - now())
    if (remaining <= 0) {
      last = {
        ok: false,
        text: '',
        threadId: '',
        events: [],
        activities: [],
        usage: undefined,
        exitCode: null,
        signal: null,
        ms: 0,
        failure: { code: 'timeout', reason: 'timeout', message: 'Codex turn timed out' },
        stderrTail: '',
        transport: planned.transport,
        warning: '',
        sawEffectiveTurn: false,
      }
      break
    }
    const mode = planned.transport
    const argv = resumed
      ? buildResumeArgv({
          threadId: resumeThreadId,
          prompt: options.prompt,
          model: options.model,
          transport: mode,
          extraArgs: options.extraArgs,
          outputLastMessage: options.outputLastMessage,
          ignoreUserConfig: options.ignoreUserConfig,
        })
      : buildExecArgv({
          cwd: options.cwd,
          prompt: options.prompt,
          sandbox: options.sandbox,
          model: options.model,
          transport: mode,
          extraArgs: options.extraArgs,
          outputLastMessage: options.outputLastMessage,
          ignoreUserConfig: options.ignoreUserConfig,
        })
    const attempt = await runAttempt({
      binary: options.binary,
      argv,
      cwd: options.cwd,
      timeoutMs: remaining,
      env: filterChildEnv(options.env ?? process.env),
      signal: options.signal,
      spawnFn,
      killSpawnFn,
      platform,
      now,
      onEvent: options.onEvent,
      fsImpl,
      outputLastMessage: options.outputLastMessage,
      transportMode: mode,
      resumed,
    })
    attempts.push({
      transport: mode,
      timeoutMs: remaining,
      ok: attempt.ok,
      ms: attempt.ms,
      ...(attempt.failure === undefined ? {} : { code: attempt.failure.code }),
    })
    last = attempt
    if (attempt.ok) break
    if (!isTransportFallback(attempt.failure) || attempt.sawEffectiveTurn) break
  }

  if (last === undefined) {
    return failureBeforeStart('timeout', 'timeout', 'Codex turn timed out before it could start', startedAt, now, transport)
  }
  return {
    ...last,
    ms: Math.max(0, now() - startedAt),
    attempts,
  }
}

/** Exposed for failure-result tests; the tool layer maps codes to advice. */
export function isKnownFailureCode(code) {
  return CODEX_ERROR_CODES.includes(code)
}
