/**
 * Gate view for the conversation-level gate panel.
 *
 * The panel needs, for the current Team only: every configured gate, its
 * effective state (session overlay wins over the global default), whether it is
 * applicable to this roster, and a short human summary of what it locks.
 *
 * Pure: all data arrives as arguments so the view is testable.
 */

import { gateApplicable, gateState, gateRequirement } from './gates.js'

/** Effective gate state for one Team. */
function stateOf(globalDisabled, sessionMap, gate) {
  return gateState(globalDisabled, sessionMap, gate.id)
}

/** One-line deny summary for display. */
function denySummary(gate) {
  const pattern = gate.deny.commandPattern === undefined ? '' : ` /${gate.deny.commandPattern}/`
  return `${gate.deny.role} ${gate.deny.tool.join('/')}${pattern}`
}

/** One-line key summary for display. */
function requirementSummary(gate) {
  const requirement = gateRequirement(gate)
  if (requirement === undefined) return 'invalid requirement'
  if (requirement.commandSuccess !== undefined) {
    return `successful ${requirement.commandSuccess.tool.join('/')} command from ${requirement.commandSuccess.role}`
  }
  return `event "${requirement.event}" from ${requirement.byRoles.join('/')}`
}

/**
 * Build the panel payload for one Team.
 *
 * @param input - { gates, globalDisabled, sessionMap, liveRoles }
 * @returns { gates: [{ id, description, deny, require, state, applicable }] }
 */
export function buildGateView({ gates, globalDisabled, sessionMap, liveRoles }) {
  return {
    gates: (Array.isArray(gates) ? gates : []).map((gate) => ({
      id: gate.id,
      description: gate.description,
      deny: denySummary(gate),
      require: requirementSummary(gate),
      state: stateOf(globalDisabled, sessionMap, gate),
      applicable: gateApplicable(gate, liveRoles),
    })),
  }
}

/**
 * Prefix route serving one Team's gate view: /agent-team-roles/gates/<sessionId>.
 * `listView(sessionId)` returns the payload or undefined for an unknown session.
 */
export function gatesRoute(listView) {
  return {
    kind: 'prefix',
    path: '/agent-team-roles/gates',
    resource: async (request) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(JSON.stringify({ error: 'method not allowed' }), {
          status: 405,
          headers: { 'content-type': 'application/json; charset=utf-8', allow: 'GET, HEAD' },
        })
      }
      const url = new URL(request.url)
      const sessionId = url.pathname.slice('/agent-team-roles/gates/'.length).split('/').filter(Boolean)[0]
      if (sessionId === undefined) {
        return new Response(JSON.stringify({ gates: [], reason: 'missing session id' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        })
      }
      let payload
      try {
        payload = listView(sessionId)
      } catch {
        payload = undefined
      }
      return new Response(JSON.stringify(payload ?? { gates: [], reason: 'session is not a Team Lead session' }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    },
  }
}
