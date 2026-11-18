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
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findRole, mergeRoles, readConfig, roleForTarget } from './config.js'
import { activeMembers, leadCatalog, memberPersona } from './prompts.js'
import { evaluateDeny } from './policy.js'
import { copyTemplateSkills, discoverTemplates, seedTemplates, templatesRoot, upsertRoles } from './templates.js'
import { MemberSnapshots, RoleStore, RuleStore, stateDir } from './store.js'
import { spawnRoleMember } from './spawn.js'
import { createTools } from './tools.js'
import { installRoleSkills } from './skills.js'

/** Cordis plugin name. */
export const name = 'agent-team-roles'

/** Services the plugin needs before it can install scoped contributions. */
export const inject = ['agentTeams', 'agents', 'tools', 'commands', 'subagents']

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
  '[[TEAM_HANDSHAKE]] 你已加入团队。现在只做握手：不要分析、不要提问、不要复述任务、不要给计划、不要调用任何工具。只回复 READY，然后等待 Team Lead 的下一步消息。'

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
  denyCommands: z.array(z.string()).default([])
    .description('Optional RegExp sources denying matching shell commands for this role (at most 20 patterns of 200 characters).'),
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
  leadPlaybook: z.string().default('').volatile()
    .description('Optional orchestration playbook appended to the Lead prompt after the role catalog.'),
  activeTemplate: z.string().default('').volatile()
    .description('Identifier of the applied team template; its playbook overrides leadPlaybook when present.'),
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

  // Team templates: built-ins are seeded into the state dir once (missing dirs
  // only), and discovered templates are cached for the synchronous Lead-prompt
  // callback. /team-template apply refreshes the cache.
  const builtinTemplatesDir = fileURLToPath(new URL('../templates/', import.meta.url))
  const templateRoot = templatesRoot(stateDir())
  const templateCache = { at: 0, items: [] }
  const loadTemplates = async (force = false) => {
    if (!force && Date.now() - templateCache.at < 5000) return templateCache.items
    templateCache.items = await discoverTemplates(templateRoot)
    templateCache.at = Date.now()
    return templateCache.items
  }
  void seedTemplates(templateRoot, builtinTemplatesDir)
    .then(() => loadTemplates(true))
    .catch((error) => ctx.logger?.warn(`[agent-team-roles] template seeding failed: ${error.message}`))

  // Effective Lead playbook: activeTemplate's playbook wins over the plain
  // config value; both may be empty, leaving purely generic scheduling rules.
  const leadPlaybook = () => {
    const active = readConfig(config, 'activeTemplate') ?? ''
    if (active !== '') {
      const template = templateCache.items.find((item) => item.id === active)
      if (template !== undefined && template.leadPlaybook.trim() !== '') return template.leadPlaybook
    }
    return readConfig(config, 'leadPlaybook') ?? ''
  }

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
        installLead({ scoped, register, tools, ctx, snapshots, roles: rolesReader, agent, playbook: leadPlaybook })
      } else {
        installMember({
          agent,
          membership,
          scoped,
          register,
          tools,
          snapshots,
          ruleStore,
          roles: rolesReader,
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

  ctx.effect(() => ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
    const handshake = Array.isArray(messages) && isHandshakeOnly(messages)
    if (!handshake) return next()
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    return { ...decision, messages: [] }
  }), 'agent-team-roles:handshake-pre-step')

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
      const presets = ctx.get('agentPresets')
      const candidates = [
        presets?.composedPreset?.(agent.ctx),
        presets?.presetForSession?.(agent.session),
        agent.session?.header?.agentPreset,
      ]
      if (!candidates.includes('team-lead')) {
        return {
          kind: 'error',
          text: 'Manual member pull is available only in a session using the Team Lead preset.',
        }
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
        const text = member.reused
          ? (member.taskSent
              ? `Reused existing ${member.roleName} as ${member.target}; task sent.`
              : `Reused existing ${member.roleName} as ${member.target}; no duplicate created.`)
          : `Spawned ${member.roleName} as ${member.target}.`
        return { kind: 'success', text }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  }), 'agent-team-roles:team-spawn-command')

  // Team template management: list discovered packs, apply one by upserting its
  // roles into the live catalog, activating its playbook, and merging its
  // private skills. Lead-only, like every catalog mutation.
  ctx.effect(() => ctx.commands.register({
    name: 'team-template',
    description: 'List or apply team templates (role catalog + Lead playbook).',
    input: { hint: 'list | apply <template id>' },
    handler: async ({ agent, rawInput }) => {
      const membership = ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead') {
        return { kind: 'error', text: 'Only the Team Lead can manage team templates.' }
      }
      // Align with /team-spawn: template management is a Team-Lead-preset feature.
      const presets = ctx.get('agentPresets')
      const presetCandidates = [
        presets?.composedPreset?.(agent.ctx),
        presets?.presetForSession?.(agent.session),
        agent.session?.header?.agentPreset,
      ]
      if (!presetCandidates.includes('team-lead')) {
        return {
          kind: 'error',
          text: 'Team templates are available only in a session using the Team Lead preset.',
        }
      }
      const [action, argument] = rawInput.trim().split(/\s+/, 2)
      const templates = await loadTemplates(true)
      if (action === 'list' || action === undefined || action === '') {
        const lines = templates.map((template) =>
          `- ${template.id}: ${template.name} — ${template.description} (${template.roles.length} roles)`)
        return { kind: 'success', text: lines.length === 0 ? 'No templates discovered.' : lines.join('\n') }
      }
      if (action !== 'apply' || argument === undefined) {
        return { kind: 'error', text: 'usage: /team-template list | apply <template id>' }
      }
      const template = templates.find((item) => item.id === argument)
      if (template === undefined) {
        const known = templates.map((item) => item.id).join(', ')
        return { kind: 'error', text: `unknown template "${argument}"; discovered templates: ${known || '(none)'}` }
      }
      try {
        const applied = await upsertRoles(roleStore, template.roles)
        const editor = ctx.get('configEditor')
        await editor.edit(ctx.fiber.entry, (current) => ({ ...current, activeTemplate: template.id }))
        const skills = await copyTemplateSkills(template.dir, path.join(stateDir(), 'skills'))
        await loadTemplates(true)
        const parts = applied.map((item) => `${item.id} (${item.action})`)
        const skillNote = skills.copied.length === 0 ? 'no skill dirs' : `skills merged: ${skills.copied.join(', ')}`
        return {
          kind: 'success',
          text: `Applied template "${template.id}". Roles: ${parts.join(', ')}. Playbook active. ${skillNote}.`,
        }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  }), 'agent-team-roles:team-template-command')

  // A dedicated Settings page owns this plugin's form; the generic schema form
  // would duplicate the same volatile fields.
  ctx.inject(['settings'], (scope) => {
    scope.effect(
      () => scope.settings.configure({ auto: false }, ctx.fiber),
      'agent-team-roles:settings-policy',
    )
  })
}

/** Whether this session runs the Team Lead preset. */
export function isTeamLeadPreset(agent) {
  const candidates = [agent?.session?.header?.agentPreset]
  return candidates.includes('team-lead')
}

/** Install the Lead's role catalog, tools, and the official-spawn guard. */
function installLead({ scoped, register, tools, ctx, snapshots, roles, agent, playbook }) {
  // Manual pulls and the team description are Team-Lead-preset features; other
  // presets run plain sessions and must not carry the roster catalog.
  if (!isTeamLeadPreset(agent)) return
  register(scoped.systemPrompt.section({
    name: 'agent-team-roles:lead-catalog',
    order: scoped.systemPrompt.getSectionOrder('TEAM_POLICY') + 10,
    text: () => leadCatalog(tools.catalog(), typeof playbook === 'function' ? playbook() : ''),
  }))
  register(scoped.systemPrompt.section({
    name: 'agent-team-roles:active-members',
    order: scoped.systemPrompt.getSectionOrder('TEAM_POLICY') + 11,
    text: () => {
      try {
        const catalog = mergeRoles(roles.read())
        const rows = ctx.agentTeams.listMembers(agent)
          .filter((member) => member.role === 'teammate')
          .map((member) => {
            const snapshot = snapshots.get(agent.id, member.name)
            const role = snapshot === undefined
              ? roleForTarget(catalog, member.name)
              : findRole(catalog, snapshot.roleId)
            return {
              name: member.name,
              status: member.status,
              description: member.description,
              role,
            }
          })
        return activeMembers(rows)
      } catch {
        return activeMembers([])
      }
    },
  }))
  for (const definition of tools.lead) register(scoped.tools.register(definition))
  register(scoped.tools.guard((exec) => {
    if (exec.name !== 'spawn_teammate') return undefined
    return 'The official spawn_teammate tool is disabled in this Team. Use spawn_team_member with a configured role instead.'
  }))
}

/** Whether every claimed message is a handshake member's READY settlement notice. */
export function isHandshakeOnly(messages) {
  return messages.length > 0 && messages.every((message) => isHandshakeSettlement(message))
}

/** Whether one claimed message is a handshake member's READY settlement notice. */
export function isHandshakeSettlement(message) {
  if (message?.source?.kind !== 'subagent-settled') return false
  const texts = Array.isArray(message.content)
    ? message.content
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text.trim())
    : []
  return texts.includes('READY') && texts.some((text) => text.startsWith('Background subagent'))
}

/** Install one managed member's role configuration. */
/** Resolve a member's installed role from its frozen snapshot or target name. */
export function roleForMember(snapshot, catalog, name) {
  return snapshot?.frozen ?? roleForTarget(catalog, name)
}

/** Install one member's role prompt, model route, tool policy, and skills. */
function installMember({ agent, membership, scoped, register, tools, snapshots, ruleStore, roles }) {
  const snapshot = snapshots.get(membership.root.id, membership.name)
  const role = roleForMember(snapshot, tools.catalog(), membership.name)
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
      // Prefer the live role definition so editing a role updates an existing
      // member's persona on the next model step; the frozen snapshot stays the
      // fallback if the role was removed.
      frozen: findRole(mergeRoles(roles.read()), roleId) ?? frozen,
      rulesText: ruleStore.render(roleId, membership.root.id),
      target: membership.name,
    }),
  }))

  const liveRole = findRole(mergeRoles(roles.read()), roleId) ?? frozen
  // denyCommands sits at the front of the guard chain and applies to both tool
  // modes: it is a command-level policy, independent of the tool whitelist.
  register(scoped.tools.guard((exec) => evaluateDeny(liveRole, exec.name, exec.arguments)))
  if (liveRole.toolMode === 'custom') {
    // Preset tools can register after agent/created. A visibility mask computed
    // here would permanently hide later-registered tools, so visibility is left
    // to the preset and the per-call guard enforces the role allow-list.
    const allowed = new Set([...liveRole.tools, ...IMPLICIT_MEMBER_TOOLS])
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
