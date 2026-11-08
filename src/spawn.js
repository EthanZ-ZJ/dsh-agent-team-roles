/**
 * Shared role-based member creation used by the Lead tool and the UI command.
 *
 * Both entry points must freeze the same snapshot before the official spawn
 * call: the member's role configuration is captured once, and a failure removes
 * the snapshot so a failed creation cannot leave a phantom managed member.
 */

import {
  DESCRIPTION_LIMIT,
  ROLE_ID,
  findRole,
  mergeRoles,
  readConfig,
  roleForTarget,
  validateRole,
} from './config.js'

/** Validate one requested teammate target. */
function validateTarget(name) {
  if (!ROLE_ID.test(name)) {
    throw new Error(`teammate target "${name}" must be lowercase kebab-case, at most 64 characters`)
  }
  if (name === 'lead') throw new Error('teammate target "lead" is reserved for the Team Lead')
}

/** Pick a free target, appending a numeric suffix when the base is taken. */
function freeTarget(base, used) {
  if (!used.has(base)) return base
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`
    if (!used.has(candidate)) return candidate
  }
}

/** Resolve a role or throw a model-facing list of configured ids. */
function requireRole(roles, id) {
  const role = findRole(roles, id)
  if (role !== undefined) return role
  const available = roles.map((candidate) => candidate.id).join(', ')
  throw new Error(`unknown role "${id}"; configured roles: ${available}`)
}

/** Find a healthy existing member of one role in caller's Team. */
function existingRoleMember({ ctx, snapshots, roles, caller, roleId }) {
  const members = ctx.agentTeams.listMembers(caller)
    .filter((member) => member.role === 'teammate' && member.status !== 'failed')
    .map((member) => {
      const snapshot = snapshots.get(caller.id, member.name)
      const role = snapshot === undefined
        ? roleForTarget(roles, member.name)
        : findRole(roles, snapshot.roleId)
      return { member, snapshot, roleId: role?.id ?? snapshot?.roleId }
    })
    .filter((candidate) => candidate.roleId === roleId)
  if (members.length === 0) return undefined
  return members.sort((left, right) => {
    const leftExact = left.member.name === roleId ? 0 : 1
    const rightExact = right.member.name === roleId ? 0 : 1
    return leftExact - rightExact
  })[0]
}

/**
 * Create one teammate from a role preset.
 *
 * @param options - plugin context, live Config, snapshot store, catalog source,
 *   exact Lead caller, role id, initial prompt, optional target/description/
 *   context override, and cancellation.
 * @returns the created member's model-facing summary.
 */
export async function spawnRoleMember({
  ctx,
  config,
  snapshots,
  roles,
  caller,
  roleId,
  prompt,
  name,
  description,
  context,
  signal,
}) {
  const catalog = mergeRoles(roles)
  const role = requireRole(catalog, roleId)
  const invalid = validateRole(role)
  if (invalid !== undefined) throw new Error(invalid)

  const existing = existingRoleMember({ ctx, snapshots, roles: catalog, caller, roleId: role.id })
  if (existing !== undefined) {
    const handshake = prompt.includes('[[TEAM_HANDSHAKE]]')
    if (!handshake) {
      await ctx.agentTeams.sendMessage(caller, {
        target: existing.member.name,
        content: [{ type: 'text', text: prompt }],
        signal: signal ?? new AbortController().signal,
      })
    }
    const reusedRole = existing.snapshot?.frozen ?? role
    return {
      target: existing.member.name,
      role: role.id,
      roleName: role.name,
      status: existing.member.status,
      context: existing.member.context ?? 'fresh',
      model: reusedRole.provider === '' ? 'session' : `${reusedRole.provider}/${reusedRole.model}`,
      reused: true,
      taskSent: !handshake,
    }
  }

  const used = new Set(ctx.agentTeams.listMembers(caller).map((member) => member.name))
  const requested = typeof name === 'string' && name.trim() !== ''
    ? name.trim().toLowerCase()
    : role.id
  validateTarget(requested)
  const target = freeTarget(requested, used)
  const kind = context === 'fork' ? 'fork' : 'fresh'
  const label = (typeof description === 'string' && description.trim() !== ''
    ? description.trim()
    : role.description || role.name
  ).slice(0, DESCRIPTION_LIMIT)

  const frozen = { ...role }
  await snapshots.record({
    rootSessionId: caller.id,
    name: target,
    roleId: role.id,
    frozen,
  })

  // Members must not inherit a minimal Leader-only composition. Give every
  // managed member the standard worker preset; the role policy still limits
  // what that member may call. A handshake spawn additionally uses caller
  // delivery so its READY settlement is not injected into the Lead.
  const handshake = prompt.includes('[[TEAM_HANDSHAKE]]')
  const subagents = ctx.get('subagents')
  const originalStart = subagents?.startActivation
  let restoreStart = false
  if (typeof originalStart === 'function') {
    try {
      subagents.startActivation = async (spec) => originalStart.call(subagents, {
        ...spec,
        ...(handshake ? { delivery: 'caller' } : {}),
        request: {
          ...(spec.request ?? {}),
          agentPreset: 'standard',
        },
      })
      restoreStart = true
    } catch {
      // A non-writable service keeps the role and pre-step fallbacks.
    }
  }

  let result
  try {
    result = await ctx.agentTeams.spawnTeammate(caller, {
      name: target,
      description: label,
      prompt: [{ type: 'text', text: prompt }],
      context: kind,
      provider: readConfig(config, `${kind}Provider`) ?? (kind === 'fork' ? 'fork' : 'spawn'),
      signal,
    })
  } catch (error) {
    await snapshots.remove(caller.id, target).catch(() => undefined)
    throw error
  } finally {
    if (restoreStart) {
      try {
        subagents.startActivation = originalStart
      } catch {
        // The service will be recreated with the plugin scope.
      }
    }
  }

  return {
    target: result.member.name,
    role: role.id,
    roleName: role.name,
    status: result.member.status,
    context: kind,
    model: frozen.provider === '' ? 'session' : `${frozen.provider}/${frozen.model}`,
    reused: false,
    taskSent: false,
  }
}
