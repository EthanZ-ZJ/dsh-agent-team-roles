/**
 * Automatic fallback switching on model-request failures.
 *
 * A member whose role configures a fallback route should not stall on an
 * exhausted quota or a broken primary provider: the host hook switches the
 * member's model route and lets the same turn retry. Switching back to the
 * primary route stays a manual Lead action (switch_member_model), exactly as
 * the workflow expects.
 *
 * The classification is deliberately conservative: transient failures
 * (rate limits with retry-after, 5xx, timeouts, aborts) are left to the harness
 * retry policy; only a failure the retry policy would make terminal triggers
 * the switch.
 */

/** Failure codes/statuses that mean "this attempt may simply be retried". */
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

const TRANSIENT_CODE = /timeout|timed[_ ]?out|econn|enotfound|socket|abort|cancel|overloaded|unavailable/i

/** Whether a failure should be left to the harness retry policy. */
export function isTransientFailure(failure) {
  if (failure === null || typeof failure !== 'object') return false
  if (typeof failure.status === 'number' && TRANSIENT_STATUS.has(failure.status)) return true
  if (typeof failure.code === 'string' && TRANSIENT_CODE.test(failure.code)) return true
  return false
}

/**
 * Decide whether one failed request should trigger a fallback switch.
 *
 * @param failure - the LlmFailure payload.
 * @param state - { alreadyFallback, attempted } for the current member/turn.
 * @returns true when the plugin should switch the member to its fallback route.
 */
export function shouldAutoSwitch(failure, { alreadyFallback = false, attempted = false } = {}) {
  if (alreadyFallback || attempted) return false
  return !isTransientFailure(failure)
}
