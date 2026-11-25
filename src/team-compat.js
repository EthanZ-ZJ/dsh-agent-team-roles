/**
 * Team runtime compatibility.
 *
 * Two Team runtimes exist in the supported range:
 *
 * - DSH before the subagent-based Team rework exposes
 *   `ctx.agentTeams.{tryMembership,listMembers,spawnTeammate,sendMessage}` and
 *   owns roster, spawning and messaging itself.
 * - Current DSH (the `dsh-agent-team` package) keeps only the task board on
 *   `ctx.agentTeams` and moves membership, spawning and messaging to
 *   `@deepseek-ai/dsh-subagent`: `rootOf()`, `namesOf()`, `startActivation()`,
 *   `resolveName()` and `sendMessage()`.
 *
 * This module keeps the plugin's call sites on the original shape and maps
 * them onto whichever runtime the deployment provides. `tryMembership` is the
 * only capability probe: the legacy runtime is used when it still answers it.
 */

const APIS = new WeakMap()

/** One compatibility instance per plugin context. */
export function teamApi(ctx) {
  let api = APIS.get(ctx)
  if (api === undefined) {
    api = createTeamApi(ctx)
    APIS.set(ctx, api)
  }
  return api
}

/** Seconds a cached roster may be reused before it is refreshed in the background. */
const ROSTER_TTL_MS = 1000

function createTeamApi(ctx) {
  /** root session id -> { rows, at, pending } */
  const rosters = new Map()

  const serviceOf = (name) => {
    const direct = ctx?.[name]
    if (direct !== undefined && direct !== null) return direct
    return typeof ctx?.get === 'function' ? ctx.get(name) : undefined
  }

  const oldTeams = () => {
    const teams = serviceOf('agentTeams')
    if (teams === undefined || teams === null) return undefined
    return typeof teams.tryMembership === 'function'
      || typeof teams.listMembers === 'function'
      || typeof teams.spawnTeammate === 'function'
      || typeof teams.sendMessage === 'function'
      ? teams
      : undefined
  }

  const subagents = () => {
    const service = serviceOf('subagents')
    if (service === undefined || service === null) return undefined
    return typeof service.rootOf === 'function'
      || typeof service.startActivation === 'function'
      || typeof service.listDescendants === 'function'
      ? service
      : undefined
  }

  function tryMembership(agent) {
    const old = oldTeams()
    if (typeof old?.tryMembership === 'function') return old.tryMembership(agent)
    const service = subagents()
    if (service === undefined || typeof service.rootOf !== 'function' || agent === undefined || agent === null) return undefined
    let root
    try {
      root = service.rootOf(agent)
    } catch {
      return undefined
    }
    if (root === undefined || root === null) return undefined
    let names
    try {
      names = service.namesOf?.(agent)
    } catch {
      names = undefined
    }
    const self = typeof names?.self === 'string' && names.self !== ''
      ? names.self
      : (root.id === agent.id ? 'lead' : String(agent.id))
    return { role: root.id === agent.id ? 'lead' : 'teammate', root, name: self }
  }

  function rosterOf(root) {
    let entry = rosters.get(root.id)
    if (entry === undefined) {
      entry = { rows: [], at: 0, pending: undefined }
      rosters.set(root.id, entry)
    }
    return entry
  }

  /** Read the durable child catalog and cache it on the root entry. */
  function refresh(root) {
    const service = subagents()
    if (service === undefined) return Promise.resolve([])
    const entry = rosterOf(root)
    if (entry.pending !== undefined) return entry.pending
    const rootSessionId = root.session?.id
    if (rootSessionId === undefined) return Promise.resolve(entry.rows)
    entry.pending = Promise.resolve()
      .then(() => service.listDescendants(rootSessionId))
      .then((list) => {
        const rows = []
        for (const item of Array.isArray(list) ? list : []) {
          if (item?.kind !== 'child') continue
          const name = typeof item.name === 'string' && item.name !== '' ? item.name : String(item.id)
          rows.push({
            name,
            id: item.id,
            role: 'teammate',
            // The catalog reports residency, not a durable outcome: "running"
            // vs "inactive". The plugin only distinguishes failed members.
            status: item.activity === 'running' ? 'running' : 'idle',
            context: 'fresh',
          })
        }
        entry.rows = rows
        entry.at = Date.now()
        return rows
      })
      .catch(() => entry.rows)
      .finally(() => {
        entry.pending = undefined
        entry.at = Date.now()
      })
    return entry.pending
  }

  function listMembers(agent) {
    const old = oldTeams()
    if (typeof old?.listMembers === 'function') return old.listMembers(agent)
    const membership = tryMembership(agent)
    if (membership === undefined) return []
    const entry = rosterOf(membership.root)
    if (Date.now() - entry.at > ROSTER_TTL_MS) void refresh(membership.root)
    return entry.rows
  }

  /** Await a fresh roster; spawning uses this so reuse does not race the cache. */
  async function refreshMembers(agent) {
    const old = oldTeams()
    if (typeof old?.listMembers === 'function') return old.listMembers(agent)
    const membership = tryMembership(agent)
    if (membership === undefined) return []
    return refresh(membership.root)
  }

  /**
   * Legacy runtime spawn. The old `spawnTeammate` drives `subagents.startActivation`
   * internally, so keep the composition overrides on that inner call and put the
   * service back afterwards.
   */
  async function spawnLegacy(old, caller, options) {
    const service = subagents()
    const original = service?.startActivation
    const blocks = Array.isArray(options?.prompt)
      ? options.prompt
      : [{ type: 'text', text: String(options?.prompt ?? '') }]
    const handshake = blocks.some((block) => block?.type === 'text'
      && typeof block.text === 'string'
      && block.text.includes('[[TEAM_HANDSHAKE]]'))
    let restore = false
    if (typeof original === 'function') {
      try {
        service.startActivation = async (spec) => original.call(service, {
          ...spec,
          ...(handshake ? { delivery: 'caller' } : {}),
          request: { ...(spec.request ?? {}), agentPreset: 'standard' },
        })
        restore = true
      } catch {
        // A non-writable service keeps the previous behaviour.
      }
    }
    try {
      return await old.spawnTeammate(caller, options)
    } finally {
      if (restore) {
        try {
          service.startActivation = original
        } catch {
          // The service will be recreated with the plugin scope.
        }
      }
    }
  }

  async function spawnTeammate(caller, options = {}) {
    const old = oldTeams()
    if (typeof old?.spawnTeammate === 'function') return await spawnLegacy(old, caller, options)
    const service = subagents()
    if (service === undefined || typeof service.startActivation !== 'function') {
      throw new Error('this deployment provides no subagent service; Agent Teams cannot spawn members')
    }
    const { name, description, prompt, context, provider, signal } = options
    const kind = context === 'fork' ? 'fork' : 'fresh'
    const blocks = Array.isArray(prompt) ? prompt : [{ type: 'text', text: String(prompt ?? '') }]
    const handshake = blocks.some((block) => block?.type === 'text'
      && typeof block.text === 'string'
      && block.text.includes('[[TEAM_HANDSHAKE]]'))
    const activation = await service.startActivation({
      provider: typeof provider === 'string' && provider !== '' ? provider : (kind === 'fork' ? 'fork' : 'spawn'),
      label: typeof description === 'string' && description !== ''
        ? description
        : (typeof name === 'string' && name !== '' ? name : 'teammate'),
      ...(typeof name === 'string' && name !== '' ? { name } : {}),
      prompt: blocks,
      parent: caller,
      signal: signal ?? new AbortController().signal,
      delivery: handshake ? 'caller' : 'parent',
      // A fresh child must not inherit the Lead-only composition. Fork
      // providers reject an independent preset, so only spawn asks for it.
      ...(kind === 'fresh' ? { agentPreset: 'standard' } : {}),
    })
    const membership = tryMembership(caller)
    const memberName = typeof activation?.name === 'string' && activation.name !== ''
      ? activation.name
      : (typeof name === 'string' ? name : 'teammate')
    if (membership !== undefined) {
      const entry = rosterOf(membership.root)
      entry.rows = [
        ...entry.rows.filter((row) => row.name !== memberName),
        { name: memberName, id: activation?.childId, role: 'teammate', status: 'running', context: kind },
      ]
      entry.at = Date.now()
      void refresh(membership.root)
    }
    return { member: { name: memberName, status: 'running', context: kind }, activation }
  }

  async function sendMessage(caller, options = {}) {
    const old = oldTeams()
    if (typeof old?.sendMessage === 'function') return old.sendMessage(caller, options)
    const service = subagents()
    if (service === undefined || typeof service.sendMessage !== 'function') {
      throw new Error('this deployment provides no subagent messaging; Agent Teams cannot reach members')
    }
    const { target, content, signal } = options
    const abort = signal ?? new AbortController().signal
    const targetId = await service.resolveName(caller, String(target), abort)
    const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content ?? '') }]
    return service.sendMessage(caller, targetId, blocks, { signal: abort })
  }

  return { tryMembership, listMembers, refreshMembers, spawnTeammate, sendMessage }
}
