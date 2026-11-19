/**
 * Natural-language gate authoring, host side.
 *
 * The Settings page cannot call a model, so it writes one request into the
 * plugin's volatile Config. This module watches that field, performs one
 * auxiliary model call, and writes a normalized draft into a second volatile
 * field. It never edits the stored gate list: the user reviews the drafts and
 * saves them from the Settings page, so the write path for live gates is
 * unchanged.
 *
 * Every failure is contained: a broken request, a missing model route, or an
 * unusable model reply only produces a result record. Gate evaluation, tools,
 * and the stored configuration keep working exactly as before.
 */

import { AsyncResource } from 'node:async_hooks'
import fs from 'node:fs/promises'
import path from 'node:path'
import { mergeRoles, readConfig } from './config.js'
import { GATE_ID, MAX_GATE_TOOLS, normalizeGate, normalizeGates, validateGate } from './gates.js'
import { stateDir } from './store.js'

/** Settings namespace owned by this plugin. */
export const GATE_PARSE_NS = 'agent-team-roles'

/** Attribution marker passed to the auxiliary model call. */
export const GATE_PARSE_PURPOSE = 'agent-team-roles-gate-parse'

/** Longest accepted natural-language description. */
export const MAX_PARSE_TEXT = 4000

/** Most drafts one request may produce. */
export const MAX_PARSE_GATES = 5

/** Longest accepted note. */
export const MAX_PARSE_NOTE = 2000

/** Most warnings one result may carry. */
export const MAX_PARSE_WARNINGS = 10

/** Longest accepted single warning. */
export const MAX_PARSE_WARNING = 200

/** Longest accepted diagnostic detail. */
export const MAX_PARSE_DETAIL = 500

/** Largest assembled prompt, in UTF-8 bytes. */
export const MAX_PARSE_PROMPT_BYTES = 24 * 1024

/** Requests older than this are treated as abandoned. */
export const PARSE_REQUEST_TTL_MS = 120_000

/** End-to-end budget of one model call. */
export const PARSE_TIMEOUT_MS = 45_000

/** How long the client may present one result. */
export const PARSE_RESULT_TTL_MS = 10 * 60 * 1000

/** Fallback poll cadence used when the update event cannot be observed. */
export const PARSE_POLL_INTERVAL_MS = 1_000

/** Result-write retry delays: the first attempt, then three retries. */
export const PARSE_RETRY_DELAYS_MS = Object.freeze([30_000, 60_000, 120_000])

/** Short marker written to the audit file on install, to prove which module runs. */
export const GATE_PARSE_MODULE_VERSION = 'v6-hmr-exit'

/** Audit file size above which the previous log is rotated away. */
export const AUDIT_MAX_BYTES = 1024 * 1024

/** Stable error codes carried by a failed result. */
export const PARSE_ERROR_CODES = Object.freeze([
  'empty-text',
  'text-too-long',
  'prompt-too-large',
  'no-route',
  'llm-unavailable',
  'llm-error',
  'timeout',
  'cancelled',
  'invalid-output',
  'stale-request',
  'persist-failed',
  'unknown',
])

/** System instruction owned by the host; generic wording only. */
export const GATE_PARSE_SYSTEM_PROMPT = [
  'You translate one user requirement into DSH Agent Team workflow gate drafts.',
  'Output ONLY a JSON object:',
  '{"gates":[{"id"?,"description"?,"deny":{"role","tool":["..."],"commandPattern"?},',
  '           "require":{"event"? | "commandSuccess"?{"role","tool","pattern"},',
  '                      "byRoles"?,"freshFor"?,"invalidateOn"?{"role"?,"tool"?[]}}}],',
  ' "note":"..."}',
  'Rules:',
  '- deny.role / byRoles / commandSuccess.role / invalidateOn.role MUST be ids from the provided roles; never invent ids; never use "lead".',
  '- Exactly one key source per gate (event XOR commandSuccess). event gates need byRoles.',
  '- commandPattern/pattern are JS RegExp sources, JSON-escaped, at most 200 characters.',
  '- For command patterns list both shell tool ids given in the prompt.',
  '- freshFor is integer seconds; 0 or omitted = valid until invalidated.',
  '- description: same language as the user requirement. ids/events: lowercase kebab-case.',
  '- If key information is missing, return {"gates":[],"note":"<what you need>"} instead of guessing.',
  '- No prose outside the JSON object.',
].join('\n')

/** Read one text value, falling back to an empty string. */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Truncate one text value to a byte/character bound. */
function clamp(value, limit) {
  const string = typeof value === 'string' ? value : ''
  return string.length <= limit ? string : string.slice(0, limit)
}

/** An empty client request. */
export function emptyParseRequest() {
  return { nonce: '', text: '', at: 0 }
}

/** An empty parse result. */
export function emptyParseResult() {
  return {
    nonce: '',
    status: '',
    gates: [],
    note: '',
    warnings: [],
    code: '',
    detail: '',
    completedAt: 0,
  }
}

/** Read the pending request, tolerating volatile references and plain objects. */
export function readParseRequest(config) {
  const raw = readConfig(config, 'gateParseRequest')
  const value = raw !== null && typeof raw === 'object' ? raw : {}
  const at = Number.isFinite(value.at) ? value.at : 0
  return { nonce: text(value.nonce), text: text(value.text), at }
}

/** Read the latest result, tolerating volatile references and plain objects. */
export function readParseResult(config) {
  const raw = readConfig(config, 'gateParseResult')
  const value = raw !== null && typeof raw === 'object' ? raw : {}
  const gates = Array.isArray(value.gates)
    ? value.gates.map((entry) => normalizeGate(entry))
    : []
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.map((entry) => text(entry)).filter(Boolean)
    : []
  return {
    nonce: text(value.nonce),
    status: text(value.status),
    gates,
    note: text(value.note),
    warnings,
    code: text(value.code),
    detail: text(value.detail),
    completedAt: Number.isFinite(value.completedAt) ? value.completedAt : 0,
  }
}

/** Project one role for the prompt. */
function promptRole(role) {
  const base = {
    id: text(role?.id),
    name: text(role?.name),
    description: text(role?.description),
  }
  const tools = Array.isArray(role?.tools) ? role.tools.map(text).filter(Boolean) : []
  return tools.length === 0 ? base : { ...base, tools }
}

/** Assemble the exact user message one request sends. */
export function buildGateParsePrompt({ text: description, roles, platformShellTool, existingGateIds }) {
  const catalog = (Array.isArray(roles) ? roles : []).map(promptRole)
  const ids = Array.isArray(existingGateIds)
    ? existingGateIds.map((entry) => text(entry)).filter(Boolean)
    : []
  const platform = text(platformShellTool) || 'bash'
  return [
    `roles: ${JSON.stringify(catalog)}`,
    `existing gate ids: ${JSON.stringify(ids)}`,
    `shell tool ids: ${JSON.stringify(['bash', 'pwsh'])}`,
    `platform shell tool: ${platform}`,
    'user requirement:',
    typeof description === 'string' ? description : '',
  ].join('\n')
}

/** Parse one model reply into a JSON value, tolerating fenced output. */
export function extractGateJson(raw) {
  if (typeof raw !== 'string') throw new Error('model reply is not text')
  let source = raw.trim()
  const fence = source.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/m)
  if (fence !== null) source = fence[1].trim()
  const options = [source.indexOf('{'), source.indexOf('[')].filter((index) => index >= 0)
  if (options.length === 0) throw new Error('model reply contains no JSON value')
  const start = Math.min(...options)
  const endObject = source.lastIndexOf('}')
  const endArray = source.lastIndexOf(']')
  const end = Math.max(endObject, endArray)
  if (end < start) throw new Error('model reply contains no complete JSON value')
  return JSON.parse(source.slice(start, end + 1))
}

/** Clean one candidate gate id: lowercase, kebab characters only. */
function cleanGateId(raw) {
  return text(raw)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/** Stable short base36 digest of one nonce; six characters, never a UUID slice. */
function nonceSeed(nonce) {
  const source = text(nonce)
  let hash = 5381
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) + hash + source.charCodeAt(index)) >>> 0
  }
  return (hash % (36 ** 6)).toString(36).padStart(6, '0')
}

/** Choose the final id: a valid cleaned id, else a hash-derived base, then a free suffix. */
function finalGateId(raw, used, nonce) {
  const cleaned = cleanGateId(raw)
  const base = GATE_ID.test(cleaned) ? cleaned : `gate-${nonceSeed(nonce)}`
  let candidate = base
  for (let index = 2; used.has(candidate); index += 1) {
    const suffix = `-${index}`
    candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`
  }
  return candidate
}

/** Collect every role reference a normalized gate carries. */
function gateRoleRefs(gate) {
  const refs = [gate.deny.role, ...gate.require.byRoles]
  if (gate.require.commandSuccess !== undefined) refs.push(gate.require.commandSuccess.role)
  if (gate.require.invalidateOn !== undefined && gate.require.invalidateOn.role !== undefined) {
    refs.push(gate.require.invalidateOn.role)
  }
  return refs.filter(Boolean)
}

/** Match a gate to the role catalog: known ids only, and never the lead. */
function checkGateRoles(gate, roleIds) {
  for (const reference of gateRoleRefs(gate)) {
    if (reference === 'lead') return 'the lead role cannot be gated'
    if (!roleIds.has(reference)) return `unknown role "${reference}"`
  }
  return ''
}

/** Add both shell tool ids to a command-pattern gate, keeping the list in bounds. */
function addShellTools(gate, warnings) {
  if (gate.deny.commandPattern === undefined) return gate
  const tools = [...gate.deny.tool]
  const added = []
  for (const shell of ['bash', 'pwsh']) {
    if (!tools.includes(shell)) {
      tools.push(shell)
      added.push(shell)
    }
  }
  if (added.length === 0) return gate
  if (tools.length > MAX_GATE_TOOLS) {
    throw new Error(`deny.tool has no room for the shell tools ${added.join(', ')}`)
  }
  warnings.push(`added shell tools ${added.join(', ')} to gate "${gate.id}"`)
  return { ...gate, deny: { ...gate.deny, tool: tools } }
}

/** Whether a raw list field is present and longer than one gate allows. */
function tooManyTools(value, field) {
  return Array.isArray(value) && value.length > MAX_GATE_TOOLS
    ? `${field} lists more than ${MAX_GATE_TOOLS} entries`
    : ''
}

/** Reject explicit list overruns instead of letting normalization truncate them. */
function checkListBounds(raw) {
  const deny = raw.deny !== null && typeof raw.deny === 'object' ? raw.deny : {}
  const require = raw.require !== null && typeof raw.require === 'object' ? raw.require : {}
  const commandSuccess = require.commandSuccess !== null && typeof require.commandSuccess === 'object'
    ? require.commandSuccess
    : {}
  const invalidateOn = require.invalidateOn !== null && typeof require.invalidateOn === 'object'
    ? require.invalidateOn
    : {}
  return tooManyTools(deny.tool, 'deny.tool')
    || tooManyTools(require.byRoles, 'require.byRoles')
    || tooManyTools(commandSuccess.tool, 'require.commandSuccess.tool')
    || tooManyTools(invalidateOn.tool, 'require.invalidateOn.tool')
}

/** One failed result. */
function failure(nonce, code, detail) {
  return {
    ...emptyParseResult(),
    nonce,
    status: 'error',
    code,
    detail: clamp(typeof detail === 'string' ? detail : '', MAX_PARSE_DETAIL),
    completedAt: Date.now(),
  }
}

/** Normalize metadata fields, truncating overruns into warnings. */
function metadata(payload, warnings) {
  const note = typeof payload.note === 'string' ? payload.note.trim() : ''
  const rawWarnings = Array.isArray(payload.warnings)
    ? payload.warnings.map((entry) => text(entry)).filter(Boolean)
    : []
  const kept = rawWarnings.slice(0, MAX_PARSE_WARNINGS).map((entry) => clamp(entry, MAX_PARSE_WARNING))
  if (rawWarnings.length > MAX_PARSE_WARNINGS) {
    kept[MAX_PARSE_WARNINGS - 1] = clamp(
      `more than ${MAX_PARSE_WARNINGS} notes; the rest were dropped`,
      MAX_PARSE_WARNING,
    )
  }
  if (note.length > MAX_PARSE_NOTE) {
    kept.push(clamp(`note truncated to ${MAX_PARSE_NOTE} characters`, MAX_PARSE_WARNING))
  }
  return {
    note: clamp(note, MAX_PARSE_NOTE),
    warnings: [...kept, ...warnings].slice(0, MAX_PARSE_WARNINGS).map((entry) => clamp(entry, MAX_PARSE_WARNING)),
  }
}

/**
 * Validate and normalize one model payload into gate drafts.
 *
 * @param payload - parsed model output: `{gates, note, warnings?}` or one gate.
 * @param options - role catalog, shell tool id, existing gate ids, request nonce.
 * @returns `{status, gates, note, warnings, code, detail}`; structural problems
 *   become `status: 'error', code: 'invalid-output'`.
 */
export function normalizeParsedGates(payload, options = {}) {
  const roles = Array.isArray(options.roles) ? options.roles : []
  const roleIds = new Set(roles.map((role) => text(role?.id)).filter(Boolean))
  const nonce = text(options.nonce)
  const used = new Set(
    (Array.isArray(options.existingGateIds) ? options.existingGateIds : []).map((entry) => text(entry)),
  )
  const warnings = []

  if (payload === null || typeof payload !== 'object') {
    return { ...emptyParseResult(), nonce, status: 'error', code: 'invalid-output', detail: 'model reply is not a JSON object' }
  }
  let entries
  if (Array.isArray(payload)) entries = payload
  else if (Array.isArray(payload.gates)) entries = payload.gates
  else if (payload.deny !== undefined || payload.require !== undefined) entries = [payload]
  else entries = undefined
  if (entries === undefined) {
    return { ...emptyParseResult(), nonce, status: 'error', code: 'invalid-output', detail: 'model reply has no gates array' }
  }
  if (entries.length > MAX_PARSE_GATES) {
    return {
      ...emptyParseResult(),
      nonce,
      status: 'error',
      code: 'invalid-output',
      detail: `model returned ${entries.length} gates; at most ${MAX_PARSE_GATES} are accepted`,
    }
  }

  const meta = metadata(payload, [])
  if (entries.length === 0) {
    if (meta.note === '') {
      return {
        ...emptyParseResult(),
        nonce,
        status: 'error',
        code: 'invalid-output',
        detail: 'model returned no gate and no note',
      }
    }
    return {
      ...emptyParseResult(),
      nonce,
      status: 'needs-input',
      note: meta.note,
      warnings: meta.warnings,
    }
  }

  const gates = []
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        ...emptyParseResult(),
        nonce,
        status: 'error',
        code: 'invalid-output',
        detail: 'one gate entry is not an object',
      }
    }
    const overrun = checkListBounds(entry)
    if (overrun !== '') {
      return { ...emptyParseResult(), nonce, status: 'error', code: 'invalid-output', detail: overrun }
    }
    let gate = normalizeGate(entry)
    gate = { ...gate, id: finalGateId(entry.id, used, nonce) }
    used.add(gate.id)
    try {
      gate = addShellTools(gate, warnings)
    } catch (error) {
      return { ...emptyParseResult(), nonce, status: 'error', code: 'invalid-output', detail: error.message }
    }
    const roleProblem = checkGateRoles(gate, roleIds)
    if (roleProblem !== '') {
      return {
        ...emptyParseResult(),
        nonce,
        status: 'error',
        code: 'invalid-output',
        detail: `gate "${gate.id}": ${roleProblem}`,
      }
    }
    const invalid = validateGate(gate)
    if (invalid !== undefined) {
      return { ...emptyParseResult(), nonce, status: 'error', code: 'invalid-output', detail: invalid }
    }
    gates.push(gate)
  }

  return {
    ...emptyParseResult(),
    nonce,
    status: 'ok',
    gates,
    note: meta.note,
    warnings: [...meta.warnings, ...warnings].slice(0, MAX_PARSE_WARNINGS),
  }
}

/**
 * Turn one raw model reply into a result payload.
 *
 * @param raw - exact model reply text.
 * @param options - same options as {@link normalizeParsedGates}.
 * @returns `{status, gates, note, warnings, code, detail}`.
 */
export function parseGateOutput(raw, options = {}) {
  let payload
  try {
    payload = extractGateJson(raw)
  } catch (error) {
    return {
      ...emptyParseResult(),
      nonce: text(options.nonce),
      status: 'error',
      code: 'invalid-output',
      detail: error.message,
    }
  }
  return normalizeParsedGates(payload, options)
}

/** Audit log path inside the plugin state directory. */
export function gateParseAuditFile() {
  return path.join(stateDir(), 'gate-parse-audit.jsonl')
}

/** Install-probe path kept separate so it never pollutes the per-parse audit. */
export function gateParseProbeFile() {
  return path.join(stateDir(), 'gate-parse-module-probe.jsonl')
}

/**
 * Append one install-probe line. This is the observable proof of which module
 * version the running Host actually loaded.
 *
 * @param version - short module marker, e.g. `v6-hmr-exit`.
 */
export async function appendGateParseProbe(version) {
  const file = gateParseProbeFile()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.appendFile(
    file,
    `${JSON.stringify({ probe: 'gate-parse-module', version, at: Date.now() })}\n`,
    'utf8',
  )
}

/**
 * Append one audit line, rotating the previous log when it grows too large.
 *
 * @param entry - JSON-serializable exact request/reply record.
 */
export async function appendGateParseAudit(entry) {
  const file = gateParseAuditFile()
  await fs.mkdir(path.dirname(file), { recursive: true })
  try {
    const stat = await fs.stat(file)
    if (stat.size > AUDIT_MAX_BYTES) {
      await fs.rename(file, path.join(path.dirname(file), 'gate-parse-audit.1.jsonl'))
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await fs.appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8')
}

/** Read one exact-string field from a finish chunk failure. */
function failureDetail(finish) {
  const failure = finish?.failure
  if (failure === null || typeof failure !== 'object') return ''
  return text(failure.code) === '' ? text(failure.message) : `${text(failure.code)}: ${text(failure.message)}`
}

/**
 * Install the host parser: watch the request field, run one auxiliary model
 * call, and project a normalized result back into Config.
 *
 * @param root0 - plugin context and live Config.
 * @param root0.ctx - host context; `llm`, `agentDefaultModel`, and
 *   `configEditor` are read opportunistically.
 * @param root0.config - live Config whose volatile fields carry the handshake.
 * @param options - `{timeoutMs}` end-to-end model budget (test injection).
 * @returns `{dispose, check, nonce}`; `check()` forces one request pass.
 */
export function installGateParser({ ctx, config }, options = {}) {
  const timeoutMs = Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : PARSE_TIMEOUT_MS
  const disposers = []
  const started = new Set()
  // One failed result write keeps its computed result and only rewrites Config:
  // the model is never called twice for the same nonce. Delays are exponential
  // and at most three retries follow the first attempt.
  const retryDelays = Array.isArray(options?.retryDelaysMs) && options.retryDelaysMs.length > 0
    ? options.retryDelaysMs.map((value) => (Number.isFinite(value) && value >= 0 ? value : 0))
    : PARSE_RETRY_DELAYS_MS
  const now = typeof options?.now === 'function' ? options.now : Date.now
  const retryState = new Map()
  const eventSeen = new Set()
  const installedAt = Date.now()
  let pollTimer = null
  let disposed = false
  let current = null
  let lastHandledNonce = ''

  const log = (level, message) => {
    try {
      const logger = ctx?.logger
      const write = logger?.[level]
      if (typeof write === 'function') write.call(logger, `[agent-team-roles] ${message}`)
    } catch {
      // Diagnostics never break the handshake.
    }
  }

  // The settings event is emitted from Settings.describe() while the loader's
  // HMR transaction is active, and that AsyncLocalStorage store travels through
  // every await of our chain. ConfigEditor.edit() then calls hmr.runExclusive()
  // (which rejects nested transactions). A resource created during plugin apply
  // is not safe: apply itself runs inside hmr.runReload()/runExclusive(), so the
  // resource inherits the very store we must escape. Use the HMR service's own
  // `executing.exit()` escape (the same pattern dsh-hmr uses for watchConfig)
  // when scheduling out-of-transaction work.
  const scheduler = new AsyncResource('agent-team-roles:gate-parse')
  const transactionStore = () => {
    try {
      const hmr = ctx?.get?.('hmr')
      const als = hmr?.executing
      return als !== null && typeof als?.getStore === 'function' ? als.getStore() : undefined
    } catch {
      return undefined
    }
  }
  /** Run `fn` in a fresh async context, outside the HMR transaction if any. */
  const runOutside = (fn) => new Promise((resolve, reject) => {
    const invoke = () => { Promise.resolve().then(fn).then(resolve, reject) }
    try {
      const hmr = ctx?.get?.('hmr')
      const als = hmr?.executing
      if (als !== null && typeof als?.exit === 'function' && als.getStore() !== undefined) {
        als.exit(invoke)
        return
      }
    } catch {
      // Fall through to the plain scheduler below.
    }
    try {
      scheduler.runInAsyncScope(() => { queueMicrotask(invoke) })
    } catch {
      queueMicrotask(invoke)
    }
  })
  const detach = (fn) => { void runOutside(fn) }

  /** Read the request through the live Config reader. */
  const requestNow = () => readParseRequest(config)

  /** Whether this nonce already produced a result. */
  const resultFor = (nonce) => {
    const result = readParseResult(config)
    return result.nonce === nonce && result.status !== '' ? result : undefined
  }

  /** Drop every retry artifact (timer included) for one nonce. */
  const clearRetry = (nonce) => {
    const state = retryState.get(nonce)
    if (state?.timer !== undefined) clearTimeout(state.timer)
    retryState.delete(nonce)
  }

  /** Drop every retry artifact for all nonces. */
  const clearAllRetries = () => {
    for (const nonce of [...retryState.keys()]) clearRetry(nonce)
  }

  /**
   * Record one failed result write: keep the computed result for a Config-only
   * retry, or give up after the first attempt plus three retries. Retries are
   * driven by their own timer, not by the fallback poll.
   */
  const notePersistFailure = (nonce, result, auditRecord = undefined) => {
    const state = retryState.get(nonce) ?? { retries: 0, notBefore: 0, result, audit: auditRecord }
    state.result = result
    state.inFlight = false
    if (auditRecord !== undefined) state.audit = auditRecord
    state.retries += 1
    if (state.retries > retryDelays.length) {
      clearRetry(nonce)
      lastHandledNonce = nonce
      log('warn', `gate parse ${nonce} gave up after ${state.retries} result writes; the client clears the request`)
      return
    }
    const delay = retryDelays[state.retries - 1]
    state.notBefore = now() + delay
    if (state.timer !== undefined) clearTimeout(state.timer)
    state.timer = setTimeout(() => { void safeCheck('retry') }, delay)
    state.timer?.unref?.()
    retryState.set(nonce, state)
  }

  /** Start the fallback poll, which only exists while a request is pending. */
  const ensurePoll = () => {
    if (pollTimer !== null || disposed) return
    pollTimer = setInterval(() => { void safeCheck('poll') }, PARSE_POLL_INTERVAL_MS)
    pollTimer?.unref?.()
  }

  /** Stop the fallback poll once no request needs it. */
  const stopPoll = () => {
    if (pollTimer === null) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  /**
   * Write one result and clear the request in a single atomic edit.
   *
   * @returns `'written'`, `'skipped'` when the request was cleared/replaced
   *   meanwhile, or throws when the edit fails.
   */
  const persist = async (nonce, result) => {
    // Re-read before writing: a cancelled or superseded request must never be
    // resurrected by a late write.
    if (requestNow().nonce !== nonce) return 'skipped'
    const editor = ctx?.get?.('configEditor')
    const entry = ctx?.fiber?.entry
    if (editor === undefined || editor === null || typeof editor.edit !== 'function' || entry === undefined) {
      throw new Error('config editor is unavailable')
    }
    await editor.edit(entry, (currentConfig) => ({
      ...currentConfig,
      gateParseRequest: emptyParseRequest(),
      gateParseResult: result,
    }))
    lastHandledNonce = nonce
    clearRetry(nonce)
    return 'written'
  }

  /** Append one audit record, never failing the caller. */
  const audit = async (record) => {
    try {
      await appendGateParseAudit(record)
    } catch (error) {
      log('warn', `gate parse audit append failed: ${error.message}`)
    }
  }

  /** Resolve one failure path: persist the error result when possible. */
  const fail = async (nonce, code, detail, extra = {}) => {
    const result = failure(nonce, code, detail)
    const auditRecord = { at: Date.now(), nonce, code, detail: result.detail, ...extra }
    let outcome
    try {
      outcome = await persist(nonce, result)
    } catch (error) {
      log('warn', `gate parse result write failed: ${error.message}`)
      // Schedule the retry before the (async) audit so a fake/blocked audit
      // cannot delay the backoff timer.
      started.delete(nonce)
      notePersistFailure(nonce, result, auditRecord)
      await audit({ ...auditRecord, code: 'persist-failed', detail: clamp(error.message, MAX_PARSE_DETAIL) })
      return
    }
    if (outcome === 'skipped') {
      clearRetry(nonce)
      await audit({ ...auditRecord, code: 'cancelled', skipped: true })
      return
    }
    clearRetry(nonce)
    await audit({ ...auditRecord, persisted: true })
  }

  /** Consume one model stream, honouring the injected timeout without relying on abort. */
  const streamReply = async (nonce, stream, controller) => {
    const iterator = stream[Symbol.asyncIterator]()
    let timer
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs)
    })
    let reply = ''
    let finish
    let timedOut = false
    try {
      for (;;) {
        // Keep the losing side of the timeout race from surfacing as an
        // unhandled rejection after the deadline already settled the call.
        const attempt = iterator.next()
        attempt.catch(() => {})
        const next = await Promise.race([attempt, deadline])
        if (next === null) {
          timedOut = true
          controller.abort()
          // Ask the producer to release, but never wait for it: a stream that
          // ignores the abort must not delay the timeout result.
          try {
            const released = iterator.return?.()
            released?.catch?.(() => {})
          } catch {
            // The producer may already be settled.
          }
          break
        }
        if (next.done === true) break
        const chunk = next.value
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') reply += chunk.text
        else if (chunk?.type === 'finish') {
          finish = chunk
          break
        }
      }
    } finally {
      clearTimeout(timer)
    }
    return { reply, finish, timedOut }
  }

  /** Drop the in-flight marker only when it still belongs to this request. */
  const releaseCurrent = (nonce) => {
    if (current !== null && current.nonce === nonce) current = null
  }

  /** Run one parse request to completion. */
  const runOnce = async (nonce, description, source) => {
    const controller = new AbortController()
    current = { nonce, controller }
    const startedAt = Date.now()
    const llm = ctx?.get?.('llm')
    if (llm === undefined || llm === null || typeof llm.stream !== 'function') {
      releaseCurrent(nonce)
      await fail(nonce, 'llm-unavailable', 'no model service is mounted', { source })
      return
    }
    const selection = ctx?.get?.('agentDefaultModel')?.currentSelection?.()
    const provider = text(selection?.provider)
    const model = text(selection?.model)
    if (provider === '' || model === '') {
      releaseCurrent(nonce)
      await fail(nonce, 'no-route', 'no default model route is configured', { source })
      return
    }
    const roles = mergeRoles(readConfig(config, 'roles') ?? [])
    const existingGateIds = normalizeGates(readConfig(config, 'gates') ?? []).map((gate) => gate.id)
    const platformShellTool = process.platform === 'win32' ? 'pwsh' : 'bash'
    const system = GATE_PARSE_SYSTEM_PROMPT
    const input = buildGateParsePrompt({ text: description, roles, platformShellTool, existingGateIds })
    const bytes = new TextEncoder().encode(`${system}\n${input}`).length
    if (bytes > MAX_PARSE_PROMPT_BYTES) {
      releaseCurrent(nonce)
      await fail(nonce, 'prompt-too-large', `prompt is ${bytes} bytes; at most ${MAX_PARSE_PROMPT_BYTES} are accepted`, { source })
      return
    }

    let reply = ''
    let finish
    let timedOut = false
    try {
      const stream = llm.stream({
        provider,
        model,
        ...(text(selection?.reasoningEffort) === '' ? {} : { reasoningEffort: text(selection.reasoningEffort) }),
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: input }] }],
        maxTokens: 1200,
        temperature: 0,
        purpose: GATE_PARSE_PURPOSE,
        signal: controller.signal,
      })
      ;({ reply, finish, timedOut } = await streamReply(nonce, stream, controller))
    } catch (error) {
      releaseCurrent(nonce)
      await fail(nonce, timedOut ? 'timeout' : 'llm-error', clamp(error?.message ?? String(error), MAX_PARSE_DETAIL), { source, system, input, output: reply })
      return
    }
    releaseCurrent(nonce)

    const latest = requestNow()
    if (latest.nonce !== nonce) {
      log('info', `gate parse ${nonce} discarded: request was cleared or replaced`)
      return
    }
    const base = { at: Date.now(), nonce, provider, model, purpose: GATE_PARSE_PURPOSE, system, input, output: reply, source }
    if (timedOut) {
      await fail(nonce, 'timeout', `model call exceeded ${timeoutMs} ms`, base)
      return
    }
    const finishKind = text(finish?.kind)
    if (finishKind === 'error') {
      await fail(nonce, 'llm-error', failureDetail(finish), base)
      return
    }
    if (finishKind === 'aborted') {
      const result = failure(nonce, 'cancelled', 'model call was aborted')
      try {
        await persist(nonce, result)
      } catch {
        // A cancelled request usually clears the fields itself.
      }
      await audit({ ...base, code: 'cancelled', detail: result.detail })
      return
    }
    if (finishKind === 'tool-calls') {
      await fail(nonce, 'invalid-output', 'model requested a tool instead of a JSON reply', base)
      return
    }
    if (finishKind === 'max-tokens') {
      await fail(nonce, 'llm-error', 'model reached maxTokens before finishing the JSON reply', base)
      return
    }

    const parsed = parseGateOutput(reply, { roles, platformShellTool, existingGateIds, nonce })
    const result = {
      ...emptyParseResult(),
      nonce,
      status: parsed.status,
      gates: parsed.gates ?? [],
      note: parsed.note ?? '',
      warnings: parsed.warnings ?? [],
      code: parsed.code ?? '',
      detail: parsed.detail ?? '',
      completedAt: Date.now(),
    }
    try {
      const outcome = await persist(nonce, result)
      if (outcome === 'skipped') {
        await audit({ ...base, code: 'cancelled', status: result.status, skipped: true })
        return
      }
      await audit({ ...base, code: result.code, detail: result.detail, status: result.status, persisted: true, ms: result.completedAt - startedAt })
    } catch (error) {
      log('warn', `gate parse result write failed: ${error.message}`)
      started.delete(nonce)
      notePersistFailure(nonce, result, base)
      await audit({ ...base, code: 'persist-failed', detail: clamp(error.message, MAX_PARSE_DETAIL) })
    }
  }

  /** Rewrite one cached result without calling the model again (single-flight). */
  const retryPersist = async (nonce, source) => {
    const state = retryState.get(nonce)
    if (state === undefined || state.inFlight === true) return
    if (state.notBefore > now()) return
    state.inFlight = true
    if (state.timer !== undefined) {
      clearTimeout(state.timer)
      state.timer = undefined
    }
    try {
      const outcome = await persist(nonce, state.result)
      if (outcome === 'skipped') {
        clearRetry(nonce)
        await audit({ ...(state.audit ?? { at: Date.now(), nonce }), source, code: 'cancelled', skipped: true })
        return
      }
      clearRetry(nonce)
      await audit({ ...(state.audit ?? { at: Date.now(), nonce }), source, retried: true, persisted: true })
    } catch (error) {
      log('warn', `gate parse result rewrite failed: ${error.message}`)
      notePersistFailure(nonce, state.result, state.audit)
      await audit({ at: Date.now(), nonce, code: 'persist-failed', detail: clamp(error.message, MAX_PARSE_DETAIL), source })
    } finally {
      const latest = retryState.get(nonce)
      if (latest !== undefined) latest.inFlight = false
    }
  }

  /** Run one request, projecting any unexpected failure as a stable result. */
  const run = async (nonce, description, source) => {
    try {
      await runOnce(nonce, description, source)
    } catch (error) {
      releaseCurrent(nonce)
      await fail(nonce, 'unknown', clamp(error?.message ?? String(error), MAX_PARSE_DETAIL), { source })
    }
  }

  /** Decide what one request needs, then start it when eligible. */
  const check = async (source) => {
    if (disposed) return
    // Any caller (event, fallback poll, retry timer, manual check) may still be
    // inside the HMR transaction. Re-enter through the escape hatch first, so
    // the eventual ConfigEditor.edit() never runs under a nested transaction.
    if (transactionStore() !== undefined) {
      await runOutside(() => check(source))
      return
    }
    let request
    try {
      request = requestNow()
    } catch (error) {
      log('warn', `gate parse request read failed: ${error.message}`)
      return
    }
    const nonce = request.nonce
    const description = request.text.trim()
    // A cleared or replaced request cancels whatever is in flight: the reply can
    // no longer be used, so the model call must stop instead of burning tokens.
    if (current !== null && current.nonce !== nonce) {
      const inFlight = current.nonce
      try {
        current.controller.abort()
      } catch {
        // The stream may already be settled.
      }
      current = null
      started.delete(inFlight)
    }
    if (nonce === '' && description === '') {
      stopPoll()
      clearAllRetries()
      return
    }
    // D5/D8: once an event owns this request the fallback poll must stop; a
    // request that never produced an event keeps one lightweight poll alive.
    const seenEvent = nonce !== '' && eventSeen.has(nonce)
    if (seenEvent) stopPoll()
    else ensurePoll()
    // Startup checks handle leftovers from a previous process only. A request
    // minted after install belongs to the live event path, which must stay the
    // source reported in the diagnostic log.
    if (source === 'startup' && request.at > installedAt) return
    const retry = nonce === '' ? undefined : retryState.get(nonce)
    if (retry !== undefined) {
      // A failed result write is retried by rewriting Config only; the cached
      // result means the model is never called twice for one nonce.
      if (retry.notBefore > now()) return
      await retryPersist(nonce, source)
      return
    }
    if (nonce !== '' && nonce === lastHandledNonce) {
      // Nothing left to do for this request; the client clears it on its own
      // timeout, so the fallback poll must not spin forever.
      stopPoll()
      return
    }
    if (nonce !== '' && started.has(nonce)) return
    // Only a request that never produced an event may be taken over by the
    // poll, and only after two poll periods so a late event still wins.
    if (source === 'poll' && !seenEvent && request.at > 0
      && Date.now() - request.at < 2 * PARSE_POLL_INTERVAL_MS) return
    const effectiveSource = seenEvent ? 'event' : 'poll'
    if (nonce !== '' && resultFor(nonce) !== undefined) {
      lastHandledNonce = nonce
      stopPoll()
      return
    }
    if (description === '') {
      if (nonce !== '') {
        lastHandledNonce = nonce
        await fail(nonce, 'empty-text', 'the request carried no description', { source: effectiveSource })
      }
      return
    }
    if (description.length > MAX_PARSE_TEXT) {
      lastHandledNonce = nonce
      await fail(nonce, 'text-too-long', `description is ${description.length} characters; at most ${MAX_PARSE_TEXT} are accepted`, { source: effectiveSource })
      return
    }
    if (nonce === '' || nonce.length > 64) {
      await fail(nonce, 'stale-request', 'the request carries no usable nonce', { source: effectiveSource })
      return
    }
    if (request.at > 0 && Date.now() - request.at > PARSE_REQUEST_TTL_MS) {
      lastHandledNonce = nonce
      await fail(nonce, 'stale-request', `request is older than ${PARSE_REQUEST_TTL_MS} ms`, { source: effectiveSource })
      return
    }
    started.add(nonce)
    if (started.size > 64) started.delete(started.values().next().value)
    log('info', `gate parse ${nonce} started via ${effectiveSource}`)
    await run(nonce, description, effectiveSource)
  }

  const safeCheck = (source) => check(source).catch((error) => {
    log('warn', `gate parse check failed: ${error.message}`)
  })

  const onDocumentUpdated = (payload) => {
    // Some emitters pass the namespace, others pass a document object.
    const namespace = typeof payload === 'string' ? payload : payload?.ns
    if (namespace !== GATE_PARSE_NS) return
    // Remember which request the event path claimed, so a later poll can never
    // be mistaken for (or preempt) the event-driven parse.
    try {
      const request = requestNow()
      if (request.nonce !== '') {
        eventSeen.add(request.nonce)
        if (eventSeen.size > 128) eventSeen.delete(eventSeen.values().next().value)
      }
    } catch {
      // A read failure only loses the attribution hint.
    }
    stopPoll()
    // Run outside the loader's HMR transaction; writing Config from inside it
    // would throw "HMR transactions cannot be nested".
    detach(() => { void safeCheck('event') })
  }

  try {
    const off = ctx?.on?.('settings/document-updated', onDocumentUpdated)
    if (typeof off === 'function') disposers.push(off)
  } catch (error) {
    log('warn', `gate parse cannot observe settings updates: ${error.message}`)
  }

  const startupTimer = setTimeout(() => { void safeCheck('startup') }, 1_500)
  startupTimer?.unref?.()

  // Install probe: proves which module version is actually running and whether
  // the escape hatch could see the HMR service. Kept in its own file so the
  // per-parse audit keeps exactly one line per parse.
  log('info', `gate parse module ${GATE_PARSE_MODULE_VERSION} installed (hmr=${ctx?.get?.('hmr') === undefined ? 'absent' : 'present'})`)
  void appendGateParseProbe(GATE_PARSE_MODULE_VERSION).catch(() => undefined)

  /** Release listeners, timers, and any in-flight call. */
  const dispose = () => {
    if (disposed) return
    disposed = true
    clearTimeout(startupTimer)
    stopPoll()
    clearAllRetries()
    for (const off of disposers.splice(0)) {
      try {
        off()
      } catch {
        // Listener disposal is best-effort during teardown.
      }
    }
    if (current !== null) {
      try {
        current.controller.abort()
      } catch {
        // The stream may already be settled.
      }
      current = null
    }
  }

  return {
    dispose,
    check: () => safeCheck('manual'),
    nonce: () => current?.nonce ?? '',
  }
}
