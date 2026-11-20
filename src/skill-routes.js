/**
 * HTTP routes exposing installed role skills to the Settings page.
 *
 * The settings page runs in the browser and cannot read the host filesystem,
 * so the plugin registers a read-only route on the host webserver:
 *
 *   GET /agent-team-roles/role-skills/<roleId>            → { skills: [names] }
 *   GET /agent-team-roles/role-skills/<roleId>/<skill>    → { name, content, filePath }
 *
 * The route only reads files. The settings UI uses the host's native file action
 * to reveal the returned path after a click.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { stateDir } from './store.js'

/** Same grammar as role ids and skill names: lowercase kebab-case. */
const NAME = /^[a-z][a-z0-9-]{0,63}$/

/** Resolve the skill folder of one role. */
function roleSkillDir(roleId) {
  return path.resolve(stateDir(), 'skills', roleId)
}

/** Reject role and skill entries that resolve outside their expected directories. */
async function resolvedRoleDir(roleId) {
  const root = await fs.realpath(path.resolve(stateDir(), 'skills'))
  const dir = await fs.realpath(roleSkillDir(roleId))
  return path.relative(root, dir) === roleId ? dir : null
}

/** List installed skill names for one role; [] when the folder is absent. */
export async function listRoleSkills(roleId) {
  if (!NAME.test(roleId)) return null
  try {
    const dir = await resolvedRoleDir(roleId)
    if (dir === null) return { skills: [] }
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const names = new Set()
    for (const entry of entries) {
      if (entry.isDirectory() && NAME.test(entry.name)) names.add(entry.name)
      if (entry.isFile() && entry.name.endsWith('.md') && NAME.test(entry.name.slice(0, -3))) names.add(entry.name.slice(0, -3))
    }
    return { skills: [...names].sort() }
  } catch {
    return { skills: [] }
  }
}

/** Read one installed skill; null when neither <skill>/SKILL.md nor <skill>.md exists. */
export async function readRoleSkill(roleId, skill) {
  if (!NAME.test(roleId) || !NAME.test(skill)) return null
  const dir = await resolvedRoleDir(roleId).catch(() => null)
  if (dir === null) return null
  for (const relative of [path.join(skill, 'SKILL.md'), `${skill}.md`]) {
    try {
      const filePath = await fs.realpath(path.join(dir, relative))
      if (path.relative(dir, filePath) !== relative || !(await fs.stat(filePath)).isFile()) continue
      const content = await fs.readFile(filePath, 'utf8')
      return { name: skill, content, filePath }
    } catch {
      // Try the next layout.
    }
  }
  return null
}

/** Read one JSON request body, bounded so a stray client cannot exhaust memory. */
async function readJsonBody(req, limit = 4096) {
  if (typeof req.json === 'function') return await req.json()
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

/** Send one JSON response on a handler-owned ServerResponse. */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(payload)
}

/**
 * Exact POST route that reveals one installed skill in the host file manager.
 *
 * The body names the role and skill; the path is re-resolved here, so a caller
 * cannot reveal an arbitrary location. Revealing is delegated to the desktop
 * session controller, which owns the native open action.
 */
export function skillRevealRoute(getController) {
  return {
    kind: 'exact',
    path: '/agent-team-roles/skill-reveal',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        return sendJson(res, 405, { error: 'method not allowed' })
      }
      try {
        const body = await readJsonBody(req)
        const role = body?.role
        const skill = body?.skill
        if (typeof role !== 'string' || typeof skill !== 'string' || !NAME.test(role) || !NAME.test(skill)) {
          return sendJson(res, 400, { error: 'expected a role and skill id' })
        }
        const installed = await readRoleSkill(role, skill)
        if (installed === null) return sendJson(res, 404, { error: `skill "${skill}" is not installed for role "${role}"` })
        const controller = getController?.()
        if (controller === undefined || typeof controller.openWorkspacePath !== 'function') {
          return sendJson(res, 501, { error: 'the host cannot open a file manager' })
        }
        if (typeof controller.canOpenWorkspacePath === 'function' && controller.canOpenWorkspacePath() === false) {
          return sendJson(res, 501, { error: 'the host cannot open a file manager' })
        }
        await controller.openWorkspacePath({ path: installed.filePath, action: 'reveal' }, AbortSignal.timeout(5000))
        return sendJson(res, 200, { revealed: true })
      } catch (error) {
        return sendJson(res, 502, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }
}

/** JSON response helper with GET/HEAD restriction. */
function json(status, body, request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8', allow: 'GET, HEAD' },
    })
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/**
 * Build the prefix route for the host webserver: { kind, path, resource }.
 * The resource never checks auth — deployment policy (loopback binding, peer
 * auth on the index) already gates the browser, and the data is read-only
 * role skill markdown.
 */
export function skillRoute() {
  return {
    kind: 'prefix',
    path: '/agent-team-roles/role-skills',
    resource: async (request) => {
      const url = new URL(request.url)
      const parts = url.pathname.slice('/agent-team-roles/role-skills/'.length).split('/').filter(Boolean)
      if (parts.length === 0 || parts.length > 2) return json(400, { error: 'expected /role-skills/<roleId>[/<skill>]' }, request)
      const [roleId, skill] = parts
      if (skill === undefined) {
        const list = await listRoleSkills(roleId)
        if (list === null) return json(400, { error: `invalid role id "${roleId}"` }, request)
        return json(200, list, request)
      }
      const read = await readRoleSkill(roleId, skill)
      if (read === null) return json(404, { error: `skill "${skill}" is not installed for role "${roleId}"` }, request)
      return json(200, read, request)
    },
  }
}
