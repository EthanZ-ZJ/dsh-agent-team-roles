/**
 * Routing decision model for the Team Lead.
 *
 * The Lead should not pick a role by intuition. This module turns one user task
 * into one role decision, either by calling a dedicated routing model (a
 * provider/model configured separately from the Team Lead's own route) or by a
 * deterministic keyword/token fallback. `route_task` in tools.js exposes the
 * same decision to the model; plugin.js wires the real LLM call.
 */

/** Supported routing modes; anything else falls back to `model`. */
export const ROUTER_MODES = Object.freeze(['model', 'rules', 'off'])

const DEFAULT_TIMEOUT_MS = 20000
const DEFAULT_MAX_TOKENS = 800
const MAX_REASON_CHARS = 200
const KEYWORD_WEIGHT = 2

/** Trim one routing string field, never throwing on a non-string. */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** A positive safe integer, or the supplied default for anything else. */
function positiveInteger(value, fallback) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}

/**
 * Resolve the live router policy from Config values.
 *
 * @param values - raw router Config values.
 * @returns the effective mode, the optional router route, and call limits.
 */
export function routerPolicy(values = {}) {
  const source = values !== null && typeof values === 'object' ? values : {}
  return {
    mode: ROUTER_MODES.includes(source.mode) ? source.mode : 'model',
    provider: text(source.provider),
    model: text(source.model),
    reasoningEffort: text(source.reasoningEffort),
    timeoutMs: positiveInteger(source.timeoutMs, DEFAULT_TIMEOUT_MS),
    maxTokens: positiveInteger(source.maxTokens, DEFAULT_MAX_TOKENS),
  }
}

/** Built-in domain hints; the matched role must still exist in the catalog. */
const KEYWORD_ROUTES = Object.freeze([
  { roleId: 'dev', words: ['前端', '页面', '样式', 'ui', '组件'] },
  { roleId: 'tse', words: ['测试', '验收', '回归'] },
  { roleId: 'cicd', words: ['发布', '部署', '上线', '回退'] },
  { roleId: 'pm', words: ['需求', '体验', 'prd', '用户故事'] },
  { roleId: 'se', words: ['架构', '接口', '契约', 'adr'] },
  { roleId: 'cr', words: ['审查', 'review', 'diff'] },
])

/** One lower-case alphanumeric token list, used for catalog-token hits. */
function tokensOf(value) {
  return (String(value ?? '').toLowerCase().match(/[a-z0-9][a-z0-9._-]*/g) ?? [])
    .filter((token) => token.length >= 2)
}

/** Clamp an arbitrary confidence value into [0, 1]. */
function confidenceOf(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.min(1, Math.max(0, number))
}

/**
 * Render the routing-model prompt.
 *
 * @param input - task, optional context, role catalog, and active members.
 * @returns the system prompt and the single user message.
 */
export function buildRouterPrompt({ task = '', context = '', roles = [], members = [] } = {}) {
  const roleLines = (Array.isArray(roles) ? roles : []).map((role) => {
    const tools = Array.isArray(role?.tools) ? role.tools.slice(0, 8) : []
    const name = text(role?.name) || text(role?.id)
    const description = text(role?.description)
    return `- ${text(role?.id)} (${name}): ${description}; tools: ${tools.join(', ')}`
  })
  const activeMembers = (Array.isArray(members) ? members : []).filter((name) => typeof name === 'string' && name !== '')
  const system = [
    'You are the routing decision model for an Agent Team Lead.',
    'Choose exactly one role from the role catalog below. Do not write code, call tools, or explain outside the JSON.',
    'Output only one JSON object:',
    '{"roleId":"<catalog role id>","confidence":<0..1>,"reason":"<at most 200 characters>","suggestedTaskPrompt":"<complete task text for that member>","needsSplit":[{"roleId":"<catalog role id>","task":"<part>"}]}',
    'roleId must be one of the catalog ids. Use needsSplit only when the task genuinely needs several roles; otherwise [].',
    '',
    'Role catalog:',
    ...roleLines,
    ...(activeMembers.length === 0 ? [] : ['', `Active teammates (reuse when suitable): ${activeMembers.join(', ')}`]),
  ].join('\n')
  const parts = [`Task:\n${String(task ?? '')}`]
  const contextText = String(context ?? '').trim()
  if (contextText !== '') parts.push(`Context:\n${contextText}`)
  return {
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: parts.join('\n\n') }] }],
  }
}

/** Extract the first balanced `{...}` object from arbitrary model text. */
function firstBalancedObject(source) {
  const start = source.indexOf('{')
  if (start < 0) throw new Error('router reply contains no JSON object')
  let depth = 0
  let quote = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') quote = false
      continue
    }
    if (char === '"') {
      quote = true
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error('router reply has an unbalanced JSON object')
}

/**
 * Tolerant parsing of one routing-model reply.
 *
 * Markdown fences are stripped, the first balanced JSON object is parsed, and
 * only decisions that satisfy the catalog are accepted. Unknown role ids and
 * invalid split entries are rejected or dropped; malformed text throws so the
 * caller can fall back to rules routing.
 */
export function parseRouterReply(reply, roleIds) {
  if (typeof reply !== 'string') throw new Error('router reply must be a string')
  const ids = roleIds instanceof Set
    ? new Set(roleIds)
    : new Set(Array.isArray(roleIds) ? roleIds : [])
  const unfenced = reply.replace(/```[a-zA-Z0-9_-]*/g, '')
  let value
  try {
    value = JSON.parse(firstBalancedObject(unfenced))
  } catch (error) {
    throw new Error(`router reply is not valid JSON: ${error.message}`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('router reply must be a JSON object')
  }
  const roleId = text(value.roleId)
  if (!ids.has(roleId)) throw new Error(`router reply picked unknown role "${roleId}"`)
  const reason = text(value.reason).slice(0, MAX_REASON_CHARS)
  const suggestedTaskPrompt = text(value.suggestedTaskPrompt)
  const needsSplit = []
  for (const entry of Array.isArray(value.needsSplit) ? value.needsSplit : []) {
    if (entry === null || typeof entry !== 'object') continue
    const splitRole = text(entry.roleId)
    const splitTask = text(entry.task)
    if (!ids.has(splitRole) || splitTask === '') continue
    needsSplit.push({ roleId: splitRole, task: splitTask })
  }
  return { roleId, confidence: confidenceOf(value.confidence), reason, suggestedTaskPrompt, needsSplit }
}

/**
 * Deterministic keyword/token routing, used when no model decision is available.
 *
 * Scores one point per catalog token hit and KEYWORD_WEIGHT per built-in domain
 * keyword hit. Highest score wins; a tie keeps catalog order. With no hit at
 * all, the built-in `general` role wins, otherwise the first catalog role.
 */
export function ruleRoute({ task = '', roles = [] } = {}) {
  const catalog = Array.isArray(roles)
    ? roles.filter((role) => role !== null && typeof role === 'object' && typeof role.id === 'string')
    : []
  if (catalog.length === 0) throw new Error('routing has no roles')
  const taskText = String(task ?? '')
  const taskTokens = new Set(tokensOf(taskText))
  const taskLower = taskText.toLowerCase()
  const scores = new Map()
  const hits = new Map()
  for (const role of catalog) {
    const roleTokens = new Set(tokensOf([
      role.id,
      role.name ?? '',
      role.description ?? '',
      ...(Array.isArray(role.tools) ? role.tools : []),
    ].join(' ')))
    const matched = []
    for (const token of taskTokens) {
      if (roleTokens.has(token)) matched.push(token)
    }
    scores.set(role.id, matched.length)
    hits.set(role.id, matched)
  }
  for (const mapping of KEYWORD_ROUTES) {
    if (!catalog.some((role) => role.id === mapping.roleId)) continue
    for (const word of mapping.words) {
      if (!taskLower.includes(word)) continue
      scores.set(mapping.roleId, (scores.get(mapping.roleId) ?? 0) + KEYWORD_WEIGHT)
      hits.get(mapping.roleId).push(word)
    }
  }
  let best = catalog[0]
  let bestScore = scores.get(best.id) ?? 0
  for (const role of catalog) {
    const score = scores.get(role.id) ?? 0
    if (score > bestScore) {
      best = role
      bestScore = score
    }
  }
  const matched = [...new Set(hits.get(best.id) ?? [])]
  const reason = bestScore === 0
    ? 'no catalog token or keyword matched; fell back to the role order'
    : `matched: ${matched.slice(0, 8).join(', ')}`
  return {
    roleId: best.id,
    confidence: bestScore === 0 ? 0.2 : Math.min(0.9, 0.4 + bestScore * 0.1),
    reason: reason.slice(0, MAX_REASON_CHARS),
    suggestedTaskPrompt: taskText,
    needsSplit: [],
  }
}

/** Race one promise against a timeout without keeping the process alive. */
function withTimeout(promise, timeoutMs) {
  let timer
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('router call timed out')), Math.max(1, timeoutMs))
    if (typeof timer.unref === 'function') timer.unref()
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Decide which role should receive one task.
 *
 * @param input - task, context, role catalog, members, router policy, and the
 *   injected model-call function.
 * @returns the decision, its source (`model` or `rules`), and elapsed time.
 * @throws 'routing is disabled' when the policy mode is `off`.
 */
export async function routeTask({ task = '', context = '', roles = [], members = [], policy, callModel } = {}) {
  const effective = routerPolicy(policy)
  if (effective.mode === 'off') throw new Error('routing is disabled')
  const catalog = Array.isArray(roles) ? roles : []
  if (catalog.length === 0) throw new Error('routing has no roles')
  const startedAt = Date.now()
  const fallback = () => ({
    ...ruleRoute({ task, roles: catalog }),
    source: 'rules',
    latencyMs: Date.now() - startedAt,
  })
  if (effective.mode !== 'model'
    || effective.provider === ''
    || effective.model === ''
    || typeof callModel !== 'function') {
    return fallback()
  }
  try {
    const prompt = buildRouterPrompt({ task, context, roles: catalog, members })
    const reply = await withTimeout(
      Promise.resolve().then(() => callModel({ system: prompt.system, messages: prompt.messages, policy: effective })),
      effective.timeoutMs,
    )
    const decision = parseRouterReply(reply, catalog.map((role) => role.id))
    return {
      ...decision,
      source: 'model',
      model: `${effective.provider}/${effective.model}`,
      latencyMs: Date.now() - startedAt,
    }
  } catch {
    // A failed, timed-out, or unparseable model call must never block dispatch.
    return fallback()
  }
}
