/**
 * Live member-model view: which model each teammate in a Team is actually using.
 *
 * Sources, in order of authority:
 *   1. the live Agent selection (`agent.model.current()`), exact while alive;
 *   2. the Lead- or auto-written route override (applies on next activation);
 *   3. the role's frozen route snapshot (the route that will be applied).
 *
 * Pure: every dependency arrives through arguments so the view can be tested.
 */

/** Build a model selection without an effort override when the model default is wanted. */
export function modelSelection({ provider, model, reasoningEffort }) {
  return { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) }
}

/** Whether two route descriptors name the same provider/model pair. */
function sameRoute(left, right) {
  return left.provider === right.provider && left.model === right.model
}

/**
 * Describe one member's effective model route.
 *
 * @param input - { name, status, role, live?, override?, hasAgent }
 *   live: agent.model.current() result when the Agent is alive.
 *   override: { provider, model, reasoningEffort?, route, via, at } from a route switch.
 * @returns a serializable member view with a stable `source` label.
 */
export function describeMember({ name, status, role, live, override, hasAgent = false }) {
  const primary = {
    provider: role?.provider ?? '',
    model: role?.model ?? '',
    reasoningEffort: role?.reasoningEffort ?? '',
  }
  const fallback = {
    provider: role?.fallbackProvider ?? '',
    model: role?.fallbackModel ?? '',
    reasoningEffort: role?.fallbackReasoningEffort ?? '',
  }
  const overrideSource = override?.route === 'primary'
    ? 'primary'
    : override?.via === 'auto' ? 'fallback-auto' : 'fallback-manual'
  const fromOverride = override === undefined
    ? undefined
    : {
        provider: override.provider ?? '',
        model: override.model ?? '',
        reasoningEffort: override.reasoningEffort ?? '',
        source: overrideSource,
        at: typeof override.at === 'number' ? override.at : 0,
      }
  let route
  let source
  let pending = false
  if (live !== undefined && live !== null) {
    route = {
      provider: live.provider ?? '',
      model: live.model ?? '',
      reasoningEffort: live.reasoningEffort ?? '',
    }
    const matchesPrimary = route.provider !== '' && sameRoute(route, primary)
    const matchesFallback = route.provider !== '' && sameRoute(route, fallback)
    if (fromOverride && sameRoute(route, fromOverride) && route.reasoningEffort === fromOverride.reasoningEffort) {
      source = fromOverride.source
    } else if (matchesFallback && (!matchesPrimary || (
      route.reasoningEffort === fallback.reasoningEffort && route.reasoningEffort !== primary.reasoningEffort
    ))) {
      source = 'fallback-manual'
    } else source = matchesPrimary ? 'primary' : 'session'
  } else if (fromOverride !== undefined) {
    route = fromOverride
    source = fromOverride.source
    pending = true
  } else {
    route = primary
    source = primary.provider === '' ? 'session' : 'primary'
    pending = !hasAgent
  }
  return {
    name,
    status: status ?? '',
    roleId: role?.id ?? '',
    roleName: role?.name ?? '',
    provider: route.provider ?? '',
    model: route.model ?? '',
    reasoningEffort: route.reasoningEffort ?? '',
    source,
    pending,
    ...(fromOverride?.at ? { changedAt: fromOverride.at } : {}),
  }
}

/**
 * Build one Team's view: the Lead's own route plus every teammate's.
 *
 * @param input - { rootId, leadSelection, roster, roleOf, liveOf, overrideOf }
 *   roster: [{ name, status }] teammates.
 *   roleOf(name): role definition or undefined.
 *   liveOf(name): ModelSelection | undefined from the live Agent.
 *   overrideOf(name): route override or undefined.
 */
export function buildRootView({ rootId, leadSelection, roster, roleOf, liveOf, overrideOf }) {
  const members = (Array.isArray(roster) ? roster : []).map((member) => describeMember({
    name: member.name,
    status: member.status,
    role: roleOf(member.name),
    live: liveOf(member.name),
    override: overrideOf(member.name),
    hasAgent: liveOf(member.name) !== undefined,
  }))
  return {
    rootId,
    lead: {
      provider: leadSelection?.provider ?? '',
      model: leadSelection?.model ?? '',
      reasoningEffort: leadSelection?.reasoningEffort ?? '',
    },
    members,
  }
}

/** Prefix route serving the live member-model view for every known Team. */
export function memberModelsRoute(listRoots) {
  return {
    kind: 'prefix',
    path: '/agent-team-roles/member-models',
    resource: async (request) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(JSON.stringify({ error: 'method not allowed' }), {
          status: 405,
          headers: { 'content-type': 'application/json; charset=utf-8', allow: 'GET, HEAD' },
        })
      }
      let roots = []
      try {
        roots = listRoots()
      } catch {
        roots = []
      }
      return new Response(JSON.stringify({ roots }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    },
  }
}
