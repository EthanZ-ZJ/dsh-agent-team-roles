/**
 * In-memory gate event ledger.
 *
 * Records which roles produced which gate events, answers freshness queries,
 * and clears a team's records on invalidation. Nothing is persisted: a host
 * restart empties every bucket, so all gates return to "unsatisfied". That is
 * the deliberate safe default — after a restart nobody can claim a stale key.
 *
 * Time is injectable for tests.
 */

export class GateLedger {
  /** @param now - optional clock; defaults to wall-clock Date.now(). */
  constructor(now = () => Date.now()) {
    this.now = now
    /** teamId -> entry[] ({event, role, at, note?}), insertion order kept. */
    this.buckets = new Map()
  }

  #bucket(teamId) {
    let bucket = this.buckets.get(teamId)
    if (bucket === undefined) {
      bucket = []
      this.buckets.set(teamId, bucket)
    }
    return bucket
  }

  /** Record one event produced by a role. Same event accumulates history. */
  record(teamId, event, role, at = this.now(), note) {
    const entry = { event, role, at, ...(typeof note === 'string' && note !== '' ? { note } : {}) }
    this.#bucket(teamId).push(entry)
    return entry
  }

  /**
   * Void recorded events for a team. Events carry no tool, so a matching
   * {role, tool} trigger clears the whole team bucket: every prior key dies
   * once the trigger role touches the watched tools.
   */
  invalidate(teamId) {
    this.buckets.delete(teamId)
  }

  /**
   * Freshest qualifying entry: latest record of `event` whose role is in
   * `byRoles` and, when `freshFor` seconds is set, whose age is within the
   * window. Returns undefined when no entry qualifies.
   */
  fresh(teamId, event, byRoles, freshFor, now = this.now()) {
    const bucket = this.buckets.get(teamId)
    if (bucket === undefined || bucket.length === 0) return undefined
    let latest
    for (const entry of bucket) {
      if (entry.event !== event) continue
      if (!Array.isArray(byRoles) || !byRoles.includes(entry.role)) continue
      if (latest === undefined || entry.at >= latest.at) latest = entry
    }
    if (latest === undefined) return undefined
    if (Number.isFinite(freshFor) && now - latest.at > freshFor * 1000) return undefined
    return latest
  }

  /** Latest record of one event regardless of age; for status display. */
  latest(teamId, event, byRoles) {
    const bucket = this.buckets.get(teamId)
    if (bucket === undefined) return undefined
    let latest
    for (const entry of bucket) {
      if (entry.event !== event) continue
      if (Array.isArray(byRoles) && !byRoles.includes(entry.role)) continue
      if (latest === undefined || entry.at >= latest.at) latest = entry
    }
    return latest
  }
}
