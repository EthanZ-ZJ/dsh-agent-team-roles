/**
 * Read-only role catalog route for the Team panel and for diagnosis.
 *
 * When a member runs on an unexpected model the first question is "what does
 * the role actually say right now". The Settings page can answer that, but a
 * running session cannot open it without losing context, so the host exposes
 * the effective catalog as JSON.
 */

import { roleFallbacks } from './config.js'

/** Project one role down to the fields that decide routing and policy. */
function summarize(role) {
  return {
    id: role.id,
    name: role.name,
    provider: role.provider,
    model: role.model,
    reasoningEffort: role.reasoningEffort,
    fallbacks: roleFallbacks(role).map((route) => ({
      provider: route.provider,
      model: route.model,
      reasoningEffort: route.reasoningEffort ?? '',
    })),
    toolMode: role.toolMode,
    tools: role.tools.length,
    skills: [...role.skills],
    denyCommands: [...role.denyCommands],
  }
}

/**
 * Build the prefix route: GET /agent-team-roles/roles.
 *
 * @param listRoles - returns the merged live catalog.
 */
export function roleCatalogRoute(listRoles) {
  return {
    kind: 'prefix',
    path: '/agent-team-roles/roles',
    resource: async (request) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(JSON.stringify({ error: 'method not allowed' }), {
          status: 405,
          headers: { 'content-type': 'application/json; charset=utf-8', allow: 'GET, HEAD' },
        })
      }
      let roles = []
      try {
        roles = (listRoles() ?? []).map(summarize)
      } catch {
        // A broken catalog answers with an empty list; the caller retries.
        roles = []
      }
      return new Response(JSON.stringify({ roles }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      })
    },
  }
}
