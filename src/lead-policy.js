/**
 * Lead tool policy: what the Team Lead must never execute itself.
 *
 * The Lead orchestrates; implementation belongs to the teammate roles. Hiding
 * the tools (A) removes the temptation, and a guard (B) turns any remaining
 * entry point into a model-facing reminder to route the work to a role.
 */

/** Implementation and workaround entry points a Team Lead must not call. */
export const LEAD_IMPLEMENTATION_TOOLS = Object.freeze([
  'write',
  'edit',
  'apply_patch',
  'pwsh',
  'bash',
  'run_code',
  'subagent',
  'subagent_fork',
])

/** Supported policy modes; anything else falls back to hiding. */
export const LEAD_TOOL_MODES = Object.freeze(['hide', 'deny', 'off'])

/**
 * Resolve the live policy from Config values.
 *
 * @param values - raw `leadToolMode` and `leadToolDeny` Config values.
 * @returns the effective mode plus the exact denied tool-name set.
 */
export function leadToolPolicy({ mode, deny } = {}) {
  const resolved = LEAD_TOOL_MODES.includes(mode) ? mode : 'hide'
  const extra = Array.isArray(deny)
    ? deny.filter((name) => typeof name === 'string' && name.trim() !== '').map((name) => name.trim())
    : []
  return { mode: resolved, names: new Set([...LEAD_IMPLEMENTATION_TOOLS, ...extra]) }
}

/**
 * The model-facing refusal for one Lead tool call.
 *
 * The message names the teammates that can take the work, so the model can
 * route in the same step instead of looking for another way to do it.
 *
 * @param tool - the denied tool name.
 * @param teammates - current teammate names in this Team.
 * @returns one instruction-shaped reason string.
 */
export function leadDelegateReason(tool, teammates = []) {
  const roster = teammates.length === 0
    ? ''
    : ` Current teammates: ${teammates.join(', ')}.`
  return `Tool "${tool}" is reserved for teammates: the Team Lead does not implement, execute, or run code itself.${roster} Let the role that owns this work do it: call spawn_team_member with that role, or send_message to the existing member. Do not look for another way to do it yourself.`
}
