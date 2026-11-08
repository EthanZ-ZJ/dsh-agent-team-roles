/**
 * Host plugin: role catalog, role-based spawning, runtime injection, and
 * self-learning rules for the official Agent Teams runtime.
 *
 * The official Team service owns roster, messages, the task board, and
 * lifecycle. This plugin only contributes role configuration and the
 * self-learning prompt layer through public Cordis extension points:
 *
 * - `agent/created` (serial, before the member's first request) installs the
 *   member-scoped model route, persona section, tool policy, skills, and tools;
 * - a `systemPrompt.section` whose text callback re-reads the rule store on
 *   every assembly makes a newly recorded rule visible on the next model step;
 * - `tools.guard` rejects the official `spawn_teammate` tool and enforces a
 *   custom role allow-list, including tools registered in the agent scope.
 */

import z from '@deepseek-ai/schemastery'
import { mergeRoles, readConfig, roleForTarget } from './config.js'
import { leadCatalog, memberPersona } from './prompts.js'
import { MemberSnapshots, RoleStore, RuleStore, stateDir } from './store.js'
import { spawnRoleMember } from './spawn.js'
import { createTools } from './tools.js'
import { installRoleSkills } from './skills.js'

/** Cordis plugin name. */
export const name = 'agent-team-roles'

/** Services the plugin needs before it can install scoped contributions. */
export const inject = ['agentTeams', 'agents', 'tools', 'commands']

/** Tool names a managed member always keeps, even under a custom policy. */
const IMPLICIT_MEMBER_TOOLS = [
  'remember_role_rule',
  'list_my_rules',
  'list_team_roles',
  'create_team_role',
  'skill',
]

/** Initial prompt used when the UI pulls a member without a task. */
const DEFAULT_TEAM_TASK =
  '你已加入团队。等待 Team Lead 分配任务；收到任务后按角色职责执行。'

const RoleSchema = z.object({
  id: z.string().description('Stable role identity; also the default teammate target.'),
  name: z.string().default('').description('Display name shown in settings and the Lead catalog.'),
  description: z.string().default('').description('One-line responsibility shown to the Lead.'),
  persona: z.string().default('').description('Standing role prompt.'),
  provider: z.string().default('').description('LLM provider route; empty inherits the Session route.'),
  model: z.string().default('').description('Provider-owned model id; empty inherits the Session model.'),
  reasoningEffort: z.string().default('').description('Reasoning effort; empty keeps the adapter default.'),
  toolMode: z.string().default('all').description('Tool policy: all, or a custom allow-list.'),
  tools: z.array(z.string()).default([]).description('Allowed tool names when toolMode is custom.'),
  skills: z.array(z.string()).default([]).description('Private skill names; empty exposes the whole role skill folder.'),
  color: z.string().default('').description('Accent color for the roster.'),
})

const RuleSchema = z.object({
  id: z.string(),
  roleId: z.string(),
  text: z.string(),
  polarity: z.string().default('preference'),
  status: z.string().default('candidate'),
  evidence: z.number().default(1),
  source: z.string().default('lead'),
  createdAt: z.number().default(0),
  updatedAt: z.number().default(0),
})

/** Live role and rule settings exposed to the Settings page. */
export const Config = z.object({
  roles: z.array(RoleSchema).default([]).volatile().description('Configured role presets.'),
  rules: z.array(RuleSchema).default([]).volatile().description('Learned standing rules.'),
  freshProvider: z.string().default('spawn').description('Subagent backend for fresh teammates.'),
  forkProvider: z.string().default('fork').description('Subagent backend for forked teammates.'),
})

/** Install the plugin's runtime contributions. */
export function apply(ctx, config) {
  const snapshots = new MemberSnapshots()
  const ruleStore = new RuleStore({
    readRules: () => readConfig(config, 'rules') ?? [],
    editor: ctx.get('configEditor'),
    entry: ctx.fiber.entry,
  })
  const roleStore = new RoleStore({
    readRoles: () => readConfig(config, 'roles') ?? [],
    editor: ctx.get('configEditor'),
    entry: ctx.fiber.entry,
  })
  const rolesReader = { read: () => readConfig(config, 'roles') ?? [] }
  const tools = createTools({
    ctx,
    config,
    snapshots,
    rules: ruleStore,
    roles: rolesReader,
  })

  // A trusted in-process API for other plugins. Agent-facing writes go through
  // the tools above, where the Lead/member boundary is enforced by scope.
  ctx.provide('agentTeamRoles', {
    list: () => roleStore.list(),
    get: (id) => roleStore.get(id),
    create: (role) => roleStore.create(role),
    update: (id, patch) => roleStore.update(id, patch),
    remove: (id) => roleStore.remove(id),
  })

  /** One disposer per installed Agent scope. */
  const installed = new Map()

  /** Install all contributions for one Agent, once. */
  function installAgent(agent) {
    if (installed.has(agent)) return
    const membership = ctx.agentTeams.tryMembership(agent)
    if (membership === undefined) return
    const scoped = agent.ctx
    if (scoped === undefined) return

    const disposers = []
    let active = true
    const register = (disposer) => {
      if (typeof disposer === 'function' && active) disposers.push(disposer)
    }
    const dispose = () => {
      if (!active) return
      active = false
      for (const disposer of disposers.splice(0).reverse()) {
        try {
          disposer()
        } catch {
          // Scope teardown is best-effort; the Agent is already going away.
        }
      }
      installed.delete(agent)
    }

    try {
      if (membership.role === 'lead') {
        installLead(scoped, register, tools)
      } else {
        installMember({
          agent,
          membership,
          scoped,
          register,
          tools,
          snapshots,
          ruleStore,
        })
      }
    } catch (error) {
      dispose()
      throw error
    }

    const handle = scoped.effect(() => dispose, 'agent-team-roles:agent')
    installed.set(agent, handle)
  }

  const onCreated = async ({ agent }) => {
    await snapshots.ready
    installAgent(agent)
  }
  const onDisposed = ({ agent }) => {
    installed.get(agent)?.()
    installed.delete(agent)
  }

  ctx.on('agent/created', onCreated)
  ctx.on('agent/disposed', onDisposed)
  ctx.effect(() => () => {
    for (const dispose of [...installed.values()]) {
      try {
        dispose()
      } catch {
        // Plugin unload is best-effort for already-disposed scopes.
      }
    }
    installed.clear()
  }, 'agent-team-roles:installed')

  void snapshots.ready.then(() => {
    for (const agent of ctx.agents.list()) {
      try {
        installAgent(agent)
      } catch (error) {
        ctx.logger?.warn(`[agent-team-roles] cannot install on existing agent ${agent.id}: ${error.message}`)
      }
    }
  })

  // The Web composer's pull control invokes this command through the existing
  // commands Remote, so a member is created without a model turn.
  ctx.effect(() => ctx.commands.register({
    name: 'team-spawn',
    description: 'Pull a configured role as a teammate without a model turn.',
    input: { hint: '<role> [task]' },
    handler: async ({ agent, rawInput, signal }) => {
      const membership = ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead') {
        return { kind: 'error', text: 'Only the Team Lead can spawn teammates.' }
      }
      const input = rawInput.trim()
      const separator = input.indexOf(' ')
      const roleId = separator < 0 ? input : input.slice(0, separator)
      const task = separator < 0 ? '' : input.slice(separator + 1).trim()
      if (roleId === '') {
        return { kind: 'error', text: 'usage: /team-spawn <role> [task]' }
      }
      try {
        const member = await spawnRoleMember({
          ctx,
          config,
          snapshots,
          roles: mergeRoles(readConfig(config, 'roles') ?? []),
          caller: agent,
          roleId,
          prompt: task === '' ? DEFAULT_TEAM_TASK : task,
          signal,
        })
        return { kind: 'success', text: `Spawned ${member.roleName} as ${member.target}.` }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  }), 'agent-team-roles:team-spawn-command')

  // A dedicated Settings page owns this plugin's form; the generic schema form
  // would duplicate the same volatile fields.
  ctx.inject(['settings'], (scope) => {
    scope.effect(
      () => scope.settings.configure({ auto: false }, ctx.fiber),
      'agent-team-roles:settings-policy',
    )
  })
}

/** Install the Lead's role catalog, tools, and the official-spawn guard. */
function installLead(scoped, register, tools) {
  register(scoped.systemPrompt.section({
    name: 'agent-team-roles:lead-catalog',
    order: scoped.systemPrompt.getSectionOrder('TEAM_POLICY') + 10,
    text: () => leadCatalog(tools.catalog()),
  }))
  for (const definition of tools.lead) register(scoped.tools.register(definition))
  register(scoped.tools.guard((exec) => {
    if (exec.name !== 'spawn_teammate') return undefined
    return 'The official spawn_teammate tool is disabled in this Team. Use spawn_team_member with a configured role instead.'
  }))
}

/** Install one managed member's role configuration. */
function installMember({ agent, membership, scoped, register, tools, snapshots, ruleStore }) {
  const snapshot = snapshots.get(membership.root.id, membership.name)
  const role = snapshot !== undefined
    ? mergeRoles([snapshot.frozen])[0]
    : roleForTarget(tools.catalog(), membership.name)
  if (role === undefined) return
  const roleId = role.id
  const frozen = snapshot?.frozen ?? role

  if (frozen.provider !== '' && frozen.model !== '') {
    try {
      agent.model?.select({
        provider: frozen.provider,
        model: frozen.model,
        ...(frozen.reasoningEffort === '' ? {} : { reasoningEffort: frozen.reasoningEffort }),
      })
    } catch (error) {
      ctxWarn(agent, `cannot select the role route for "${membership.name}": ${error.message}`)
    }
  }

  register(scoped.systemPrompt.section({
    name: 'agent-team-roles:member-persona',
    order: scoped.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 100,
    text: () => memberPersona({
      frozen,
      rulesText: ruleStore.render(roleId, membership.root.id),
      target: membership.name,
    }),
  }))

  if (frozen.toolMode === 'custom') {
    const allowed = new Set([...frozen.tools, ...IMPLICIT_MEMBER_TOOLS])
    const globalNames = new Set(
      scoped.tools.definitions().map((definition) => definition.name),
    )
    const visibleGlobal = [...allowed].filter((toolName) => globalNames.has(toolName))
    if (visibleGlobal.length > 0) {
      register(scoped.tools.restrict({ allow: visibleGlobal }))
    }
    register(scoped.tools.guard((exec) => {
      if (allowed.has(exec.name)) return undefined
      return `Tool "${exec.name}" is not allowed by role "${roleId}".`
    }))
  }

  for (const definition of tools.member) register(scoped.tools.register(definition))
  register(scoped.tools.guard((exec) => {
    if (exec.name !== 'spawn_teammate') return undefined
    return 'Only the Team Lead can create teammates, and this Team uses spawn_team_member with a configured role.'
  }))

  try {
    const disposeSkills = installRoleSkills(agent, role)
    register(disposeSkills)
  } catch (error) {
    ctxWarn(agent, `cannot install private skills for role "${roleId}": ${error.message}`)
  }
}

/** Warn through the Agent's logger when one is reachable. */
function ctxWarn(agent, message) {
  agent.ctx?.logger?.warn(`[agent-team-roles] ${message}`)
}

export { stateDir }
