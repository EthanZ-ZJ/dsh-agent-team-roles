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
  const role = requireRole(mergeRoles(roles), roleId)
  const invalid = validateRole(role)
  if (invalid !== undefined) throw new Error(invalid)

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

  // A handshake spawn has no task to report. Ask the subagent manager for
  // caller delivery so the child's READY settlement is not injected into the
  // Lead at all; otherwise that notice wakes the Lead into an empty turn.
  const handshake = prompt.includes('[[TEAM_HANDSHAKE]]')
  const subagents = handshake ? ctx.get('subagents') : undefined
  const originalStart = subagents?.startActivation
  let restoreStart = false
  if (typeof originalStart === 'function') {
    try {
      subagents.startActivation = async (spec) => originalStart.call(subagents, { ...spec, delivery: 'caller' })
      restoreStart = true
    } catch {
      // A non-writable service keeps the pre-step fallback.
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
  }
}
