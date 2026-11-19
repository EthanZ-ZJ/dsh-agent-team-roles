/**
 * Codex backend contract surface: configuration validation, error mapping,
 * prompt/argv helpers, thread rotation rules, and small pure transformations.
 *
 * The process execution itself lives in `codex-runner.js`; this module is the
 * policy layer shared by `spawn.js`, `tools.js`, and tests.
 */

import { spawn as nodeSpawn } from 'node:child_process'
import { readConfig } from './config.js'
import {
  CODEX_FAST_PROVIDER_ARGS,
  INTERNAL_TO_CONTRACT,
  buildExecArgv,
  buildResumeArgv,
  detectCodexBinary,
  internalToContract,
  parseJsonl,
  validateExtraArgs as validateRunnerExtraArgs,
} from './codex-runner.js'

export { INTERNAL_TO_CONTRACT, internalToContract }

/** The nine closed error codes from the contract. */
export const CODEX_CODES = Object.freeze({
  CLI_NOT_FOUND: 'CODEX_CLI_NOT_FOUND',
  NOT_LOGGED_IN: 'CODEX_NOT_LOGGED_IN',
  TIMEOUT: 'CODEX_TIMEOUT',
  EXIT_NONZERO: 'CODEX_EXIT_NONZERO',
  OUTPUT_UNPARSEABLE: 'CODEX_OUTPUT_UNPARSEABLE',
  BUSY: 'CODEX_BUSY',
  RESUME_FAILED: 'CODEX_RESUME_FAILED',
  UNSUPPORTED_CONTEXT: 'CODEX_UNSUPPORTED_CONTEXT',
  DENIED_BY_CONFIG: 'CODEX_DENIED_BY_CONFIG',
})

export const CODEX_ALL_CODES = Object.freeze(Object.values(CODEX_CODES))

export const CODEX_SANDBOXES = Object.freeze(['read-only', 'workspace-write', 'danger-full-access'])

export const CODEX_TRANSPORTS = Object.freeze(['auto', 'fast', 'default'])

export const CODEX_TIMEOUT_RANGE = Object.freeze({ min: 30_000, max: 1_800_000 })

export const CODEX_THREAD_MAX_TURNS = 12
export const CODEX_LAST_ANSWERS_LIMIT = 3
export const CODEX_LAST_ANSWER_CHARS = 800
export const CODEX_ROTATION_CHARS = 6_000
export const CODEX_LAST_MESSAGE_TAIL = 4_096
export const CODEX_LOGIN_CACHE_MS = 5 * 60_000
export const CODEX_DETECT_CACHE_MS = 60_000

/** One model/provider-facing Codex error with a closed code. */
export class CodexError extends Error {
  constructor(code, reason, message) {
    super(`[${code}]${reason === '' ? '' : ` ${reason}:`} ${message}`)
    this.name = 'CodexError'
    this.code = code
    this.reason = reason
  }
}

/** Build one closed-code Codex error. */
export function codexError(code, reason = '', message = '') {
  return new CodexError(code, reason, message)
}

/** Truncate a diagnostic at a UTF-8-ish character boundary. */
export function limitDiagnostic(text, max = CODEX_LAST_MESSAGE_TAIL) {
  const value = typeof text === 'string' ? text : String(text ?? '')
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

/** Remove common secrets and absolute home paths from one text. */
export function redactCodexText(text) {
  let value = typeof text === 'string' ? text : String(text ?? '')
  value = value.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-<redacted>')
  value = value.replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer <redacted>')
  value = value.replace(/eyJ[A-Za-z0-9._-]{10,}/g, '<jwt>')
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
  if (home !== '') {
    const escaped = home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    value = value.replace(new RegExp(escaped, 'gi'), '<home>')
  }
  return value
}

/** Redact one audit record recursively (no tokens, no raw outputs). */
export function redactCodexRecord(record) {
  if (record === null || typeof record !== 'object') return record
  if (Array.isArray(record)) return record.map((entry) => redactCodexRecord(entry))
  const output = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === 'aggregated_output' || key === 'stdout' || key === 'stderr') {
      output[key] = '<redacted>'
      continue
    }
    if (typeof value === 'string') {
      output[key] = redactCodexText(value)
      continue
    }
    output[key] = redactCodexRecord(value)
  }
  return output
}

/** Read the Codex configuration fields from the live (possibly volatile) Config. */
export function readCodexConfig(config) {
  return {
    backend: readConfig(config, 'codexBackend') === true,
    binary: typeof readConfig(config, 'codexBinary') === 'string'
      ? readConfig(config, 'codexBinary').trim()
      : '',
    model: typeof readConfig(config, 'codexModel') === 'string'
      ? readConfig(config, 'codexModel').trim()
      : '',
    sandbox: readConfig(config, 'codexSandbox') ?? 'danger-full-access',
    transport: readConfig(config, 'codexTransport') ?? 'auto',
    timeoutMs: Number(readConfig(config, 'codexTimeoutMs') ?? 0),
    extraArgs: Array.isArray(readConfig(config, 'codexExtraArgs'))
      ? readConfig(config, 'codexExtraArgs').map((entry) => String(entry))
      : [],
  }
}

const FORBIDDEN_EXACT = new Set([
  '-s', '--sandbox', '--full-auto', '--yolo', '--dangerously-bypass-approvals-and-sandbox',
  '-a', '--ask-for-approval', '-C', '--cd', '--add-dir', '--worktree',
  '--ignore-user-config', '--ephemeral', '--json', '--skip-git-repo-check',
  '-m', '--model', '-o', '--output-last-message', '--output-schema',
  'exec', 'resume', 'login', '--help', '-h', '--version', '--',
])

const CONFIG_KEY_BLOCK = /(sandbox|sandbox_mode|windows\.sandbox|approval_policy|approvals_reviewer|model_provider|model_providers)/i

/**
 * Validate `codexExtraArgs`: append-only flags, never controlled arguments.
 * The runner owns the authoritative validator; this wrapper keeps the
 * contract-facing `{code,reason,detail}` shape.
 */
export function validateExtraArgs(extraArgs) {
  const problem = validateRunnerExtraArgs(extraArgs)
  return problem === undefined
    ? undefined
    : { code: CODEX_CODES.DENIED_BY_CONFIG, reason: problem.reason, detail: problem.message }
}

/** Validate the whole Codex configuration; returns a CodexError or undefined. */
export function validateCodexConfig(codexConfig) {
  if (codexConfig.binary.length > 1024) {
    return codexError(CODEX_CODES.DENIED_BY_CONFIG, 'forbidden-arg', 'codexBinary exceeds 1024 characters')
  }
  if (codexConfig.model.length > 200) {
    return codexError(CODEX_CODES.DENIED_BY_CONFIG, 'forbidden-arg', 'codexModel exceeds 200 characters')
  }
  if (!CODEX_SANDBOXES.includes(codexConfig.sandbox)) {
    return codexError(CODEX_CODES.DENIED_BY_CONFIG, 'invalid-sandbox', `invalid codexSandbox "${codexConfig.sandbox}"`)
  }
  if (!CODEX_TRANSPORTS.includes(codexConfig.transport)) {
    return codexError(CODEX_CODES.DENIED_BY_CONFIG, 'provider-unreachable', `invalid codexTransport "${codexConfig.transport}"`)
  }
  const timeout = Number(codexConfig.timeoutMs)
  if (!(timeout === 0 || (Number.isSafeInteger(timeout) && timeout >= CODEX_TIMEOUT_RANGE.min && timeout <= CODEX_TIMEOUT_RANGE.max))) {
    return codexError(CODEX_CODES.DENIED_BY_CONFIG, 'forbidden-arg', 'codexTimeoutMs must be 0 or an integer in 30000..1800000')
  }
  const extra = validateExtraArgs(codexConfig.extraArgs)
  if (extra !== undefined) return codexError(extra.code, extra.reason, extra.detail)
  return undefined
}

/** Resolve the effective sandbox: role override > global > default. */
export function resolveSandbox(role, codexConfig) {
  const roleSandbox = typeof role?.codexSandbox === 'string' ? role.codexSandbox.trim() : ''
  if (CODEX_SANDBOXES.includes(roleSandbox)) return roleSandbox
  return CODEX_SANDBOXES.includes(codexConfig?.sandbox) ? codexConfig.sandbox : 'danger-full-access'
}

/** Refresh a detection result at most once per minute (per binary config). */
const detectionCache = new Map()

/** Detect (with a short process-lifetime cache) or fail with CLI_NOT_FOUND. */
export async function resolveCodexBinary(codexConfig, deps = {}) {
  const key = codexConfig.binary === '' ? '*' : codexConfig.binary
  const now = deps.now ?? Date.now
  const cached = detectionCache.get(key)
  if (cached !== undefined && now() - cached.at < CODEX_DETECT_CACHE_MS) return cached.value
  const detected = await detectCodexBinary({ configuredPath: codexConfig.binary, ...deps })
  if (detected.path === '') {
    const tried = detected.tried.map((entry) => `${entry.level}:${entry.path}${entry.reason === undefined ? '' : ` (${entry.reason})`}`).join('; ')
    const hint = detected.hint ?? 'configure codexBinary manually with an absolute codex.exe path (.cmd shims are not supported)'
    const error = codexError(CODEX_CODES.CLI_NOT_FOUND, '', `Codex CLI was not found; tried: ${limitDiagnostic(tried)}. ${hint}`)
    detectionCache.set(key, { at: now(), value: { ...detected, error } })
    return { ...detected, error }
  }
  const value = { ...detected, error: undefined }
  detectionCache.set(key, { at: now(), value })
  return value
}

/** Clear the detection cache (used by the Settings "detect" button later). */
export function clearCodexDetectionCache() {
  detectionCache.clear()
}

/** Login check cache keyed by binary path. */
const loginCache = new Map()

/** Clear the login cache (tests). */
export function clearCodexLoginCache() {
  loginCache.clear()
}

/**
 * Run `<binary> login status` once per five minutes. Returns `{loggedIn, cached, output}`.
 * A missing binary/CLI is reported as not logged in only when the probe fails.
 */
export async function checkCodexLogin(binary, deps = {}) {
  const now = deps.now ?? Date.now
  const cached = loginCache.get(binary)
  if (cached !== undefined && now() - cached.at < CODEX_LOGIN_CACHE_MS) {
    return { ...cached.value, cached: true }
  }
  const spawnFn = deps.spawnFn ?? nodeSpawn
  const result = await new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    let child
    try {
      child = spawnFn(binary, ['login', 'status'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    } catch (error) {
      finish({ loggedIn: false, cached: false, output: error?.message ?? 'spawn failed' })
      return
    }
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* gone */ }
      finish({ loggedIn: false, cached: false, output: 'login status timed out' })
    }, 15_000)
    timer?.unref?.()
    child.on('error', (error) => { clearTimeout(timer); finish({ loggedIn: false, cached: false, output: error?.message ?? '' }) })
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('close', (code) => {
      clearTimeout(timer)
      const output = `${stdout}\n${stderr}`.trim()
      const loggedIn = code === 0 && /logged in/i.test(output)
      finish({ loggedIn, cached: false, output: limitDiagnostic(output) })
    })
  })
  loginCache.set(binary, { at: now(), value: result })
  return result
}

/** Build argv for a fresh or resumed Codex turn (contract §5.2). */
export function buildCodexArgs(codexConfig, options) {
  const transport = options.transport ?? codexConfig.transport
  const fast = transport !== 'default'
  if (options.threadId !== undefined && options.threadId !== '') {
    return buildResumeArgv({
      threadId: options.threadId,
      prompt: options.prompt,
      sandbox: options.sandbox,
      model: codexConfig.model,
      transport: fast ? 'fast' : 'default',
      extraArgs: codexConfig.extraArgs,
      outputLastMessage: options.outputLastMessage,
    })
  }
  return buildExecArgv({
    cwd: options.cwd,
    prompt: options.prompt,
    sandbox: options.sandbox,
    model: codexConfig.model,
    transport: fast ? 'fast' : 'default',
    extraArgs: codexConfig.extraArgs,
    outputLastMessage: options.outputLastMessage,
  })
}

/** Parse a complete Codex JSONL stream (contract name). */
export function parseCodexJsonl(stdout) {
  return parseJsonl(stdout)
}

/** Map a runner-level failure to the closed nine-code contract. */
export function mapCodexFailure(failure) {
  if (failure === undefined || failure === null) return undefined
  const code = String(failure.code ?? '')
  const mapped = internalToContract(code)
  const message = limitDiagnostic(redactCodexText(String(failure.message ?? '')))
  return { code: mapped.code, reason: failure.reason ?? mapped.reason, message }
}

/** Map a plain runner-shaped result to the contract error (or undefined when ok). */
export function mapCodexError(result) {
  if (result === undefined || result === null) return undefined
  if (result.failure !== undefined) return mapCodexFailure(result.failure)
  if (result.ok !== true) return mapCodexFailure({ code: 'turn-failed', message: 'Codex turn failed' })
  return undefined
}

/**
 * Decide whether an `auto` fast attempt should fall back to the default
 * transport. Only transport-level failure qualifies; 401/auth and semantic
 * failures do not.
 */
export function selectTransport(codexConfig, failure) {
  const transport = codexConfig.transport ?? 'auto'
  if (transport !== 'auto') return undefined
  if (failure?.code === 'provider-unreachable') return 'default'
  return undefined
}

/** Whether a thread needs a fresh id (turns/length/sandbox change). */
export function needsRotation(thread, sandbox) {
  if (thread === undefined || thread === null) return false
  if (thread.sandbox !== undefined && sandbox !== undefined && thread.sandbox !== sandbox) return true
  if (Number(thread.turns ?? 0) >= CODEX_THREAD_MAX_TURNS) return true
  const answers = Array.isArray(thread.lastAnswers) ? thread.lastAnswers : []
  const total = answers.reduce((sum, answer) => sum + String(answer ?? '').length, 0)
  return total > CODEX_ROTATION_CHARS
}

/** Build the Codex prompt header for one turn (contract §5.4). */
export function buildCodexPrompt({ role, member, cwd, task, resumed = false, transport = 'auto', rotationSummary = '' }) {
  const name = typeof role?.name === 'string' && role.name !== '' ? role.name : String(role?.id ?? '')
  const persona = typeof role?.persona === 'string' ? role.persona.slice(0, 2_000) : ''
  const description = typeof role?.description === 'string' ? role.description : ''
  const header = [
    '[agent-team-roles:codex]',
    `member: ${member}  role: ${role?.id ?? ''} (${name})`,
    `workspace: ${cwd}   thread: ${resumed ? 'resume' : 'new'}   transport: ${transport}`,
    description,
    persona,
  ]
  if (rotationSummary !== '') header.push('', rotationSummary)
  header.push('', '--- 任务（原文） ---', String(task ?? ''))
  const text = header.join('\n')
  return text.length > 4_096 * 2 ? text.slice(0, 4_096 * 2) : text
}

/** Rotate one thread record after a resume failure or boundary. */
export function rotateThread(thread, { now = Date.now } = {}) {
  return {
    ...(thread ?? {}),
    threadId: '',
    turns: 0,
    lastAnswers: [],
    rotatedFrom: String(thread?.threadId ?? ''),
    updatedAt: now(),
  }
}

/** Trim one lastAnswer list to the contract shape. */
export function pushLastAnswer(lastAnswers, answer) {
  const normalized = Array.isArray(lastAnswers) ? lastAnswers.map((entry) => String(entry ?? '')) : []
  const next = [...normalized, String(answer ?? '').slice(0, CODEX_LAST_ANSWER_CHARS)]
  while (next.length > CODEX_LAST_ANSWERS_LIMIT) next.shift()
  return next
}

export { CODEX_FAST_PROVIDER_ARGS }
