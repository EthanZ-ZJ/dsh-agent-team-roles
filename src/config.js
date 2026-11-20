/**
 * Role catalog values, defaults, and pure lookup helpers.
 *
 * The catalog is stored in the plugin's volatile Config so the Settings page can
 * edit it without restarting the plugin. The built-in `general` role is always
 * available: it is both the shipped default and the fallback for a member whose
 * role was deleted while a Session still references it.
 */

/** Role identity grammar for a teammate target. */
export const ROLE_ID = /^[a-z][a-z0-9-]{0,63}$/

/** Longest role description the official teammate roster accepts. */
export const DESCRIPTION_LIMIT = 200

/** Longest persona accepted by the editor. */
export const PERSONA_LIMIT = 12000

/** Built-in fallback role. */
export const GENERAL_ROLE = Object.freeze({
  id: 'general',
  name: 'General',
  description: 'General-purpose teammate for tasks that do not match a specialized role.',
  persona:
    'You are a general-purpose teammate. Work directly on the task you were given, keep changes focused, and report what you changed and verified. Ask for clarification only when the task cannot be completed safely.',
  provider: '',
  model: '',
  reasoningEffort: '',
  fallbackReasoningEffort: '',
  toolMode: 'all',
  tools: [],
  skills: [],
  denyCommands: [],
  codexSandbox: '',
  color: '',
})

/** Read a Config field that may be volatile. */
export function readConfig(config, key) {
  const value = config?.[key]
  return value !== null && typeof value === 'object' && typeof value.get === 'function'
    ? value.get()
    : value
}

/** Trim one string field, falling back to an empty string. */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Normalize one stored role into the complete shape the runtime reads. */
export function normalizeRole(input) {
  const role = input !== null && typeof input === 'object' ? input : {}
  const toolMode = role.toolMode === 'custom' ? 'custom' : 'all'
  return {
    id: text(role.id).toLowerCase(),
    name: text(role.name) || text(role.id),
    description: text(role.description),
    persona: text(role.persona),
    provider: text(role.provider),
    model: text(role.model),
    reasoningEffort: text(role.reasoningEffort),
    fallbackProvider: text(role.fallbackProvider),
    fallbackModel: text(role.fallbackModel),
    fallbackReasoningEffort: text(role.fallbackReasoningEffort),
    toolMode,
    tools: toolMode === 'custom' && Array.isArray(role.tools)
      ? [...new Set(role.tools.map(text).filter(Boolean))]
      : [],
    skills: Array.isArray(role.skills) ? [...new Set(role.skills.map(text).filter(Boolean))] : [],
    denyCommands: Array.isArray(role.denyCommands)
      ? [...new Set(role.denyCommands.map(text).filter(Boolean))]
      : [],
    codexSandbox: text(role.codexSandbox),
    color: text(role.color),
  }
}

/** Normalize and order a stored role list, keeping the first duplicate. */
export function normalizeRoles(input) {
  const roles = []
  const seen = new Set()
  for (const candidate of Array.isArray(input) ? input : []) {
    const role = normalizeRole(candidate)
    if (role.id === '' || !ROLE_ID.test(role.id) || seen.has(role.id)) continue
    seen.add(role.id)
    roles.push(role)
  }
  return roles
}

/**
 * Merge the built-in fallback role into a stored catalog.
 *
 * A stored role with the same id always wins, so editing the shipped `general`
 * role in Settings is authoritative. The fallback only appears when the stored
 * catalog does not contain it.
 */
export function mergeRoles(input) {
  const roles = normalizeRoles(input)
  if (roles.some((role) => role.id === GENERAL_ROLE.id)) return roles
  return [normalizeRole(GENERAL_ROLE), ...roles]
}

/** Find one role by exact identity. */
export function findRole(roles, id) {
  return roles.find((role) => role.id === id)
}

/**
 * Resolve the role a teammate target belongs to.
 *
 * The dedicated spawn tool names the first instance after the role id
 * (`reviewer`); later instances append a numeric suffix (`reviewer-2`). A target
 * that does not match a configured role returns undefined.
 */
export function roleForTarget(roles, target) {
  const exact = findRole(roles, target)
  if (exact !== undefined) return exact
  const base = target.replace(/-\d+$/, '')
  return base === target ? undefined : findRole(roles, base)
}

/** Resolve the next free target for a role, respecting the official name grammar. */
export function nextTarget(roles, roleId, used) {
  const role = findRole(roles, roleId)
  const base = role?.id ?? roleId
  if (!used.has(base)) return base
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`
    if (!used.has(candidate)) return candidate
  }
}

/** Report the first validation failure of one role, or undefined when valid. */
export function validateRole(role) {
  if (!ROLE_ID.test(role.id)) return `role id "${role.id}" must be lowercase kebab-case (letters, digits, hyphens; at most 64 characters)`
  if (role.id === 'lead') return 'role id "lead" is reserved for the Team Lead'
  if (role.description.length > DESCRIPTION_LIMIT) return `role "${role.id}" description exceeds ${DESCRIPTION_LIMIT} characters`
  if (role.persona.length > PERSONA_LIMIT) return `role "${role.id}" persona exceeds ${PERSONA_LIMIT} characters`
  if (role.provider === '' ? role.model !== '' : role.model === '') {
    return `role "${role.id}" must configure both provider and model, or neither`
  }
  if ((role.fallbackProvider ?? '') === '' ? (role.fallbackModel ?? '') !== '' : (role.fallbackModel ?? '') === '') {
    return `role "${role.id}" must configure both fallbackProvider and fallbackModel, or neither`
  }
  if (role.toolMode === 'custom' && role.tools.length === 0) {
    return `role "${role.id}" uses a custom tool policy but lists no tools`
  }
  if (role.denyCommands.length > 20) {
    return `role "${role.id}" lists more than 20 denyCommands patterns`
  }
  if (role.codexSandbox !== '' && !['read-only', 'workspace-write', 'danger-full-access'].includes(role.codexSandbox)) {
    return `role "${role.id}" has an invalid codexSandbox; use read-only, workspace-write, danger-full-access or empty`
  }
  for (const pattern of role.denyCommands) {
    if (pattern.length > 200) return `role "${role.id}" has a denyCommands pattern longer than 200 characters`
    try {
      // eslint-disable-next-line no-new
      new RegExp(pattern)
    } catch {
      return `role "${role.id}" has a denyCommands pattern that is not a valid regex: ${pattern}`
    }
  }
  return undefined
}
