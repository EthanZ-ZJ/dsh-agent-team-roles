/**
 * HTTP routes exposing installed role skills to the Settings page.
 *
 * The settings page runs in the browser and cannot read the host filesystem,
 * so the plugin registers a read-only route on the host webserver:
 *
 *   GET /agent-team-roles/role-skills/<roleId>            → { skills: [names] }
 *   GET /agent-team-roles/role-skills/<roleId>/<skill>    → { name, content }
 *
 * Path segments are validated against the role/skill id grammar, which makes
 * traversal impossible; reads stay inside the role's skill folder. The route is
 * strictly read-only: skills are authored by agents (or by hand on disk), never
 * through this endpoint.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { stateDir } from './store.js'

/** Same grammar as role ids and skill names: lowercase kebab-case. */
const NAME = /^[a-z][a-z0-9-]{0,63}$/

/** Resolve the skill folder of one role. */
function roleSkillDir(roleId) {
  return path.join(stateDir(), 'skills', roleId)
}

/** List installed skill names for one role; [] when the folder is absent. */
export async function listRoleSkills(roleId) {
  if (!NAME.test(roleId)) return null
  try {
    const entries = await fs.readdir(roleSkillDir(roleId), { withFileTypes: true })
    return { skills: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() }
  } catch {
    return { skills: [] }
  }
}

/** Read one installed skill; null when neither <skill>/SKILL.md nor <skill>.md exists. */
export async function readRoleSkill(roleId, skill) {
  if (!NAME.test(roleId) || !NAME.test(skill)) return null
  for (const candidate of [path.join(roleSkillDir(roleId), skill, 'SKILL.md'), path.join(roleSkillDir(roleId), `${skill}.md`)]) {
    try {
      const content = await fs.readFile(candidate, 'utf8')
      return { name: skill, content }
    } catch {
      // try the next layout
    }
  }
  return null
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
