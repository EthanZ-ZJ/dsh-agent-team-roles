/**
 * Durable settings change log for role configuration.
 *
 * Roles are edited from several places: the Settings page (a direct Config
 * mutate), Lead tools (`update_team_role`, `/team-template apply`), and the role
 * service used by other plugins. When a model route changes without warning,
 * the only way to explain it is a record of what changed and who changed it.
 *
 * The log has one write path per process: `observe()` diffs the role catalog it
 * is given against the previous observation and appends one JSONL line. Callers
 * that know their identity call `note(actor)` first; an unannounced change is
 * attributed to the Settings page, which is the only writer that bypasses this
 * plugin.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { readJsonBody } from './request-body.js'

/** Fields compared per role; a model-route surprise is the motivating case. */
export const LOGGED_FIELDS = [
  'name',
  'description',
  'persona',
  'provider',
  'model',
  'reasoningEffort',
  'fallbackProvider',
  'fallbackModel',
  'fallbackReasoningEffort',
  'fallbacks',
  'toolMode',
  'tools',
  'skills',
  'denyCommands',
  'color',
]

/** Keep the file small enough to read in one page. */
const MAX_ENTRIES = 400

/** Shorten one field value so a log line stays readable. */
function summarize(value) {
  if (typeof value === 'string') return value.length <= 160 ? value : `${value.slice(0, 160)}…`
  if (Array.isArray(value)) {
    const items = value.slice(0, 12).map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
    return value.length > 12 ? [...items, `…(+${value.length - 12})`] : items
  }
  if (value === undefined) return null
  const text = JSON.stringify(value)
  return text.length <= 240 ? value : `${text.slice(0, 240)}…`
}

/** Compare two normalized values by their JSON shape. */
function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Diff two role catalogs into per-role field changes.
 *
 * A role that appears in only one side reports the whole role under `added` or
 * `removed`, so a deletion is as visible as a route change.
 */
export function diffRoles(before, after) {
  const beforeById = new Map((Array.isArray(before) ? before : []).map((role) => [role?.id, role]))
  const afterById = new Map((Array.isArray(after) ? after : []).map((role) => [role?.id, role]))
  const changed = []
  for (const [id, next] of afterById) {
    if (typeof id !== 'string') continue
    const previous = beforeById.get(id)
    if (previous === undefined) {
      changed.push({ roleId: id, added: true, fields: LOGGED_FIELDS.filter((field) => next?.[field] !== undefined && !same(next[field], undefined)).map((field) => ({ field, from: null, to: summarize(next[field]) })) })
      continue
    }
    const fields = []
    for (const field of LOGGED_FIELDS) {
      if (same(previous[field], next?.[field])) continue
      fields.push({ field, from: summarize(previous[field]), to: summarize(next?.[field]) })
    }
    if (fields.length > 0) changed.push({ roleId: id, fields })
  }
  for (const [id, previous] of beforeById) {
    if (typeof id === 'string' && !afterById.has(id)) changed.push({ roleId: id, removed: true, fields: [] })
  }
  return changed
}

/** JSONL file plus in-process attribution state. */
export class SettingsLog {
  /**
   * @param options - State directory that owns `settings.log`.
   */
  constructor({ dir }) {
    this.file = path.resolve(dir, 'settings.log')
    this.last = null
    this.pending = undefined
    this.queue = Promise.resolve()
  }

  /**
   * Attribute the next observed change to one actor.
   *
   * A note is consumed by the next change and ignored otherwise, so a write
   * that ends up a no-op cannot mislabel a later Settings edit.
   */
  note(actor) {
    if (typeof actor !== 'string' || actor.trim() === '') return
    this.pending = { actor: actor.trim(), at: Date.now() }
  }

  /**
   * Observe one role catalog; append a line when it differs from the last one.
   *
   * Called on every role read, so the comparison stays a single fingerprint.
   * A difference with no field-level change (reordering only) is not logged.
   */
  observe(roles, at = Date.now()) {
    const fingerprint = JSON.stringify(roles ?? [])
    const previous = this.last
    this.last = fingerprint
    if (previous === undefined || previous === null || previous === fingerprint) return undefined
    let before
    try {
      before = JSON.parse(previous)
    } catch {
      before = []
    }
    const changes = diffRoles(before, roles)
    if (changes.length === 0) return undefined
    const note = this.pending !== undefined && at - this.pending.at <= 15000 ? this.pending : undefined
    this.pending = undefined
    const entry = { at, actor: note?.actor ?? 'settings', changes }
    void this.append(entry)
    return entry
  }

  /** Append one entry, trimming the file after a write. */
  append(entry) {
    this.queue = this.queue.catch(() => undefined).then(async () => {
      try {
        await fs.mkdir(path.dirname(this.file), { recursive: true })
        await fs.appendFile(this.file, `${JSON.stringify(entry)}\n`, 'utf8')
        await this.trim()
      } catch {
        // The log is diagnostic: a read-only state directory must not break a
        // settings write that already succeeded.
      }
    })
    return this.queue
  }

  /** Drop the oldest lines past the cap; a missing file is not an error. */
  async trim() {
    try {
      const text = await fs.readFile(this.file, 'utf8')
      const lines = text.split('\n').filter((line) => line.trim() !== '')
      if (lines.length <= MAX_ENTRIES) return
      await fs.writeFile(this.file, `${lines.slice(-MAX_ENTRIES).join('\n')}\n`, 'utf8')
    } catch {
      // The append already succeeded; trimming is best-effort.
    }
  }

  /** Read the newest entries first. */
  async read(limit = 50) {
    const cap = Math.max(1, Math.min(200, Number.isFinite(limit) ? Math.trunc(limit) : 50))
    let text = ''
    try {
      text = await fs.readFile(this.file, 'utf8')
    } catch {
      return []
    }
    const entries = []
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      try {
        entries.push(JSON.parse(line))
      } catch {
        // A torn final line from a crash is skipped, never fatal.
      }
    }
    return entries.slice(-cap).reverse()
  }
}

/** JSON response helper with GET restriction. */
function json(status, body, request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8', allow: 'GET, HEAD' },
    })
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Send one JSON response on a handler-owned ServerResponse. */
function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/**
 * POST /agent-team-roles/apply-settings
 *
 * Applies the current role configuration to live members and returns what each
 * one received, so the Team panel can report the effect instead of guessing.
 */
export function applySettingsRoute(apply) {
  return {
    kind: 'exact',
    path: '/agent-team-roles/apply-settings',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        return sendJson(res, 405, { error: 'method not allowed' })
      }
      try {
        const result = await apply()
        return sendJson(res, 200, result)
      } catch (error) {
        return sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }
}

/**
 * Host routes for the Team panel:
 *
 *   GET  /agent-team-roles/settings-log?limit=<n>       → { entries }
 *   POST /agent-team-roles/settings-log-note            → note an upcoming actor
 *
 * The note route exists because the Settings page writes the Config directly;
 * it announces "this change is mine" right after a successful save so the entry
 * names the right actor instead of the generic fallback. Reads and writes are
 * separate routes because a resource route only serves GET.
 */
export function settingsLogRoute(log) {
  return {
    kind: 'prefix',
    path: '/agent-team-roles/settings-log',
    resource: async (request) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json(405, { error: 'method not allowed' }, request)
      }
      const limit = Number(new URL(request.url).searchParams.get('limit') ?? 50)
      return json(200, { entries: await log.read(limit) }, request)
    },
  }
}

/** POST-only route that attributes the next observed change to one actor. */
export function settingsLogNoteRoute(log) {
  return {
    kind: 'exact',
    path: '/agent-team-roles/settings-log-note',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        return sendJson(res, 405, { error: 'method not allowed' })
      }
      let actor = 'settings'
      try {
        const body = await readJsonBody(req)
        if (typeof body?.actor === 'string' && body.actor.trim() !== '') actor = body.actor.trim().slice(0, 80)
      } catch {
        // An unreadable body still announces the Settings page.
      }
      log.note(actor)
      return sendJson(res, 200, { noted: true })
    },
  }
}
