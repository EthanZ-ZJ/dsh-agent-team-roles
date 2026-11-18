/**
 * Role-level command policy: denyCommands.
 *
 * denyCommands is an optional per-role list of RegExp sources. When a member
 * whose role carries patterns invokes a shell tool (bash / pwsh) with a
 * matching command, the call is rejected before dispatch. This is independent
 * of the tool whitelist: a role may be allowed to use pwsh overall while still
 * being denied specific commands (for example git push).
 */

/** Shell tool names a denyCommands policy applies to. */
const SHELL_TOOLS = new Set(['bash', 'pwsh'])

/** Compile one role's denyCommands into tested regexes. */
export function compileDenyCommands(role) {
  const patterns = Array.isArray(role?.denyCommands) ? role.denyCommands : []
  const compiled = []
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern === '') continue
    try {
      compiled.push({ pattern, regex: new RegExp(pattern) })
    } catch {
      // Invalid patterns are rejected by validateRole; skip defensively here.
    }
  }
  return compiled
}

/**
 * Evaluate one tool dispatch against a role's denyCommands.
 *
 * Only shell dispatches with a string command can match; everything else
 * returns undefined. A hit returns a model-facing rejection reason that names
 * the role and the matched rule; a miss returns undefined.
 */
export function evaluateDeny(role, execName, args) {
  if (!SHELL_TOOLS.has(execName)) return undefined
  let parsed = args
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return undefined
    }
  }
  const command = parsed?.command
  if (typeof command !== 'string') return undefined
  const roleId = typeof role?.id === 'string' && role.id !== '' ? role.id : 'unknown'
  for (const { pattern, regex } of compileDenyCommands(role)) {
    if (regex.test(command)) {
      return `Command blocked by role policy: role "${roleId}" denies commands matching /${pattern}/ ` +
        '(denyCommands). This operation is reserved or prohibited for this role in this team; ' +
        'delegate it through the Team Lead instead of retrying.'
    }
  }
  return undefined
}
