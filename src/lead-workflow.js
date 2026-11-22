/**
 * Lead workflow guard: dispatch before investigating.
 *
 * The tool policy already removes implementation tools. This module covers the
 * remaining way a Lead drifts: reading, searching, and reasoning over the code
 * itself instead of assigning the work. The budget is deliberately small and
 * per turn: one self-check is allowed, then the Lead must dispatch, and after a
 * dispatch it may read only enough to verify what a member reported.
 */

/** Tools that hand work to a role: using one counts as dispatching. */
export const DISPATCH_TOOLS = Object.freeze([
  'spawn_team_member',
  'send_message',
  'team_task_create',
  'team_task_update',
])

/** Read-only tools that count as the Lead investigating on its own. */
export const SELF_SERVICE_TOOLS = Object.freeze(['read', 'grep', 'glob', 'read_image'])

/** Supported workflow modes; anything else keeps the enforced default. */
export const LEAD_WORKFLOW_MODES = Object.freeze(['dispatch-first', 'off'])

function positiveInteger(value, fallback) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isSafeInteger(number) || number < 0) return fallback
  return number
}

/**
 * Resolve the live workflow policy from Config values.
 *
 * @param values - raw mode and budget Config values.
 * @returns the effective mode and the two per-turn limits.
 */
export function leadWorkflowPolicy({ mode, selfBudget, preDispatchBudget } = {}) {
  return {
    mode: LEAD_WORKFLOW_MODES.includes(mode) ? mode : 'dispatch-first',
    selfBudget: positiveInteger(selfBudget, 3),
    preDispatchBudget: positiveInteger(preDispatchBudget, 1),
  }
}

/**
 * One turn's dispatch/self-check counters.
 *
 * `reset(turn)` is called on every tool call with the agent's current turn, so a
 * new turn starts from zero without needing a turn-end event.
 */
export function createLeadWorkflowCounter() {
  let turn = null
  let used = 0
  let dispatched = false
  return {
    reset(nextTurn) {
      if (nextTurn === turn) return
      turn = nextTurn
      used = 0
      dispatched = false
    },
    /** Whether this tool call hands work to a role. */
    observeDispatch(name) {
      if (!DISPATCH_TOOLS.includes(name)) return false
      dispatched = true
      return true
    },
    /** Count one self-check call and report the running total. */
    use() {
      used += 1
      return used
    },
    get dispatched() {
      return dispatched
    },
    get used() {
      return used
    },
  }
}

/** Model-facing refusal when the Lead investigates before dispatching. */
export function preDispatchRefusal(limit) {
  return `Dispatch the work before investigating further: you already used ${limit} self-check call(s) this turn without assigning anything. Call spawn_team_member with the role that owns this work (or send_message / team_task_create for an existing member), then read only what you need to check their report. Do not keep inspecting the code yourself.`
}

/** Model-facing refusal when the per-turn self-check budget is exhausted. */
export function selfWorkRefusal(limit) {
  return `Self-check budget for this turn is ${limit} call(s), and you have used it. Hand the remaining investigation to the member that owns the work and decide from their report; do not keep reading the code yourself. Report what you dispatched, not what you analysed.`
}
