/**
 * Shared role-based member creation used by the Lead tool and the UI command.
 *
 * Both entry points must freeze the same snapshot before the official spawn
 * call: the member's role configuration is captured once, and a failure removes
 * the snapshot so a failed creation cannot leave a phantom managed member.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import {
  DESCRIPTION_LIMIT,
  ROLE_ID,
  findRole,
  mergeRoles,
  readConfig,
  roleForTarget,
  validateRole,
} from './config.js'
import {
  CODEX_CODES,
  codexError,
  readCodexConfig,
  resolveCodexBinary,
  resolveSandbox,
  validateCodexConfig,
} from './codex-cli.js'

/** Resolve a Codex member's execution context, or throw a closed-code error. */
async function precheckCodex({ config, role, caller }) {
  const codex = readCodexConfig(config)
  if (!codex.backend) {
    throw codexError(CODEX_CODES.DENIED_BY_CONFIG, 'disabled', 'Codex backend is disabled (codexBackend=false)')
  }
  const invalid = validateCodexConfig(codex)
  if (invalid !== undefined) throw invalid
  const sandbox = resolveSandbox(role, codex)
  const detected = await resolveCodexBinary(codex)
  if (detected.error !== undefined) throw detected.error
  const cwd = typeof caller?.session?.header?.cwd === 'string' && caller.session.header.cwd.trim() !== ''
    ? caller.session.header.cwd
    : process.cwd()
  if (!cwd.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(cwd)) {
    throw codexError(CODEX_CODES.DENIED_BY_CONFIG, 'invalid-cwd', `session cwd "${cwd}" is not absolute`)
  }
  let stat
  try {
    stat = await fs.stat(cwd)
  } catch {
    throw codexError(CODEX_CODES.DENIED_BY_CONFIG, 'invalid-cwd', `session cwd "${cwd}" does not exist`)
  }
  if (!stat.isDirectory()) {
    throw codexError(CODEX_CODES.DENIED_BY_CONFIG, 'invalid-cwd', `session cwd "${cwd}" is not a directory`)
  }
  return { codex, sandbox, cwd, binary: detected.path, version: detected.version }
}

/** Validate one requested teammate target. */
function validateTarget(name) {
  if (!ROLE_ID.test(name)) {
    throw new Error(`teammate target "${name}" must be lowercase kebab-case, at most 64 characters`)
  }
  if (name === 'lead') throw new Error('teammate target "lead" is reserved for the Team Lead')
}

/**
 * Validate shared image paths for one member task.
 *
 * Only absolute paths inside the caller's session cwd are accepted: this keeps
 * the feature a workspace passthrough and blocks arbitrary host reads. Each
 * path must exist as a file; the returned list is normalized with forward
 * slashes so the member can read it directly.
 */
export async function resolveSharedImages(caller, images) {
  const list = Array.isArray(images) ? images : []
  if (list.length === 0) return []
  if (list.length > 8) throw new Error('at most 8 images can be shared with one member')
  const cwd = typeof caller?.session?.header?.cwd === 'string' && caller.session.header.cwd.trim() !== ''
    ? caller.session.header.cwd
    : undefined
  if (cwd === undefined) throw new Error('sharing images requires a session working directory')
  const root = path.resolve(cwd)
  const resolved = []
  for (const raw of list) {
    if (typeof raw !== 'string' || raw.trim() === '') throw new Error('image entries must be non-empty paths')
    const full = path.resolve(raw.trim())
    const relative = path.relative(root, full)
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`image "${raw}" is outside the session working directory`)
    }
    const stat = await fs.stat(full).catch(() => undefined)
    if (stat === undefined || !stat.isFile()) throw new Error(`image "${raw}" does not exist`)
    resolved.push(full.split(path.sep).join('/'))
  }
  return resolved
}

/** Append the shared-image reading instructions to one member prompt. */
function withImageNote(prompt, images) {
  if (images.length === 0) return prompt
  const list = images.map((image) => '- ' + image).join('\n')
  return prompt + '\n\nShared images (open each one with the read_image tool to see it):\n' + list
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

/** Find a healthy existing member of one role and executor in caller's Team. */
function existingRoleMember({ ctx, snapshots, roles, caller, roleId, executor }) {
  const members = ctx.agentTeams.listMembers(caller)
    .filter((member) => member.role === 'teammate' && member.status !== 'failed')
    .map((member) => {
      const snapshot = snapshots.get(caller.id, member.name)
      const role = snapshot === undefined
        ? roleForTarget(roles, member.name)
        : findRole(roles, snapshot.roleId)
      return {
        member,
        snapshot,
        roleId: role?.id ?? snapshot?.roleId,
        executor: snapshot?.executor ?? 'native',
      }
    })
    .filter((candidate) => candidate.roleId === roleId && candidate.executor === executor)
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
 *   exact Lead caller, role id, initial prompt, optional workspace image
 *   paths shared with the member, optional target/description/context
 *   override, and cancellation.
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
  images,
  name,
  description,
  context,
  backend = 'native',
  signal,
}) {
  const catalog = mergeRoles(roles)
  const role = requireRole(catalog, roleId)
  const invalid = validateRole(role)
  if (invalid !== undefined) throw new Error(invalid)
  const executor = backend === 'codex' ? 'codex' : 'native'
  if (executor === 'codex' && context === 'fork') {
    throw codexError(CODEX_CODES.UNSUPPORTED_CONTEXT, '', 'backend:"codex" does not support context:"fork"')
  }
  const codex = executor === 'codex' ? await precheckCodex({ config, role, caller }) : undefined

  const existing = existingRoleMember({
    ctx,
    snapshots,
    roles: catalog,
    caller,
    roleId: role.id,
    executor,
  })
  if (existing !== undefined) {
    const handshake = prompt.includes('[[TEAM_HANDSHAKE]]')
    const shared = await resolveSharedImages(caller, images)
    const taskText = withImageNote(prompt, shared)
    if (!handshake) {
      await ctx.agentTeams.sendMessage(caller, {
        target: existing.member.name,
        content: [{ type: 'text', text: taskText }],
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
      executor,
      sandbox: existing.snapshot?.codex?.sandbox ?? codex?.sandbox ?? '',
      threadId: '',
      reused: true,
      taskSent: !handshake,
      images: shared,
    }
  }

  const used = new Set(ctx.agentTeams.listMembers(caller).map((member) => member.name))
  const requested = typeof name === 'string' && name.trim() !== ''
    ? name.trim().toLowerCase()
    : role.id
  validateTarget(requested)
  const target = freeTarget(requested, used)
  const kind = executor === 'codex' ? 'fresh' : context === 'fork' ? 'fork' : 'fresh'
  const label = (typeof description === 'string' && description.trim() !== ''
    ? description.trim()
    : role.description || role.name
  ).slice(0, DESCRIPTION_LIMIT)

  const frozen = { ...role }
  await snapshots.record({
    rootSessionId: caller.id,
    name: target,
    roleId: role.id,
    executor,
    ...(executor === 'codex'
      ? { codex: { cwd: codex.cwd, sandbox: codex.sandbox, transport: codex.codex.transport, binary: codex.binary } }
      : {}),
    frozen,
  })

  // Members must not inherit a minimal Leader-only composition. Give every
  // managed member the standard worker preset; the role policy still limits
  // what that member may call. A handshake spawn additionally uses caller
  // delivery so its READY settlement is not injected into the Lead.
  const handshake = prompt.includes('[[TEAM_HANDSHAKE]]')
  const shared = handshake ? [] : await resolveSharedImages(caller, images)
  const spawnPrompt = withImageNote(prompt, shared)
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
      prompt: [{ type: 'text', text: spawnPrompt }],
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
    executor,
    sandbox: codex?.sandbox ?? '',
    threadId: '',
    reused: false,
    taskSent: false,
    images: shared,
  }
}
