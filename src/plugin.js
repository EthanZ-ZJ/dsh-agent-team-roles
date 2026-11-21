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
import { findRole, mergeRoles, readConfig, roleFallbacks, roleForTarget } from './config.js'
import { activeMembers, leadCatalog, memberPersona } from './prompts.js'
import { evaluateDeny } from './policy.js'
import {
  GateSchema,
  auditGateList,
  commandFromArgs,
  commandSuccessEvent,
  effectiveDisabledGates,
  evaluateGates,
  gateApplicable,
  gateKeyRoles,
  gateRequirement,
  gateState,
  normalizeGates,
  pathFromArgs,
  validateGate,
} from './gates.js'
import { GateLedger } from './ledger.js'
import { shouldAutoSwitch } from './auto-fallback.js'
import { buildGateView, gatesRoute } from './gate-view.js'
import { buildRootView, memberModelsRoute, modelSelection } from './member-models.js'
import { CodexThreadStore } from './codex-store.js'
import { modelCatalogRoute } from './model-catalog.js'
import { skillRevealRoute, skillRoute } from './skill-routes.js'
import { SettingsLog, settingsLogNoteRoute, settingsLogRoute, applySettingsRoute } from './settings-log.js'
import { roleCatalogRoute } from './role-routes.js'
import { memberModelRoute } from './member-model-route.js'
import { copyTemplateSkills, discoverTemplates, mergeTemplateGates, seedTemplates, templatesRoot, upsertRoles } from './templates.js'
import { MemberSnapshots, RoleStore, RuleStore, stateDir } from './store.js'
import { spawnRoleMember } from './spawn.js'
import { createTools } from './tools.js'
import { installRoleSkills } from './skills.js'

/** Cordis plugin name. */
export const name = 'agent-team-roles'

/** Services the plugin needs before it can install scoped contributions. */
export const inject = ['agentTeams', 'agents', 'tools', 'commands', 'subagents']

/** Permit lookup only; memory writes still require the role's explicit policy. */
const MEMORY_LOOKUP_TOOLS = ['memory_recall', 'wiki_search', 'wiki_read']
const WEB_LOOKUP_TOOLS = ['web_search', 'web_fetch']

/** Native browser acceptance uses the existing desktop MCP, not a new transport. */
const TSE_BROWSER_TOOLS = [
  'skills_get', 'status', 'permissions', 'list_windows', 'list_apps', 'launch',
  'focus_window', 'snapshot', 'find', 'get', 'is', 'screenshot', 'click',
  'set_value', 'type', 'select', 'scroll', 'scroll_to', 'press', 'wait',
].map((action) => `mcp__agent-desktop__desktop_${action}`)

/** Policy for native members with a custom role allow-list, including old saved roles. */
export function nativeMemberAllowList(roleId, configuredTools) {
  return new Set([
    ...configuredTools,
    ...IMPLICIT_MEMBER_TOOLS,
    ...(roleId === 'tse' ? TSE_BROWSER_TOOLS : []),
  ])
}

const TSE_BROWSER_GUIDANCE = [
  '### Web 验收（TSE）',
  '网页交互验收用 agent-desktop，不用 web_fetch 的内容代替实际操作。先用 desktop_skills_get 阅读 desktop 与 platform；仅打开任务指定的本地、预发或获准测试页面，用测试账号和数据。用 list_windows、snapshot、find 定位浏览器及控件，操作后重新读取页面，记录实际结果与证据。',
  '如果没有测试 URL、MCP 工具不可见、宿主拒绝操作，或页面无法验证，标记未验证并向 Lead 报告阻塞；不绕过权限，不操作生产数据。',
].join('\n')

/** Tool names a managed member always keeps, even under a custom policy. */
export const IMPLICIT_MEMBER_TOOLS = [
  ...MEMORY_LOOKUP_TOOLS,
  ...WEB_LOOKUP_TOOLS,
  // Shared-image tasks promise the member can look at the picture; read_image
  // is read-only and cannot widen what a member may change.
  'read_image',
  'remember_role_rule',
  'list_my_rules',
  'list_team_roles',
  'create_team_role',
  'skill',
  // Gate participation must not be lockable by a misconfigured whitelist: any
  // member may report an event. Safety is unaffected because the evaluator
  // only accepts events whose producer role is in a gate's byRoles; events from
  // unrelated roles satisfy nothing.
  'report_gate_event',
]

/**
 * Codex members are external Agent relays and are explicitly exempt from DSH
 * gates (D7). The DSH-side relay can also look up project memory and web content.
 */
const CODEX_MEMBER_TOOLS = [
  ...MEMORY_LOOKUP_TOOLS,
  ...WEB_LOOKUP_TOOLS,
  'codex_exec',
  'send_message',
  'team_task_create',
  'team_task_get',
  'team_task_list',
  'team_task_update',
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
  fallbackProvider: z.string().default('')
    .description('Fallback LLM provider when the primary route is unavailable (for example quota exhausted); empty means no fallback.'),
  fallbackModel: z.string().default('')
    .description('Fallback model id; must be configured together with fallbackProvider.'),
  fallbackReasoningEffort: z.string().default('')
    .description('Reasoning effort for the fallback model; empty uses the model default.'),
  fallbacks: z.array(z.object({
    provider: z.string().default(''),
    model: z.string().default(''),
    reasoningEffort: z.string().default(''),
  })).default([]).description('Ordered fallback routes tried in order; empty keeps the legacy single fallback fields.'),
  toolMode: z.string().default('all').description('Tool policy: all, or a custom allow-list.'),
  tools: z.array(z.string()).default([]).description('Allowed tool names when toolMode is custom.'),
  denyCommands: z.array(z.string()).default([])
    .description('Optional RegExp sources denying matching shell commands for this role (at most 20 patterns of 200 characters).'),
  skills: z.array(z.string()).default([]).description('Private skill names; empty exposes the whole role skill folder.'),
  codexSandbox: z.string().default('')
    .description('Role-level Codex sandbox override (read-only / workspace-write / danger-full-access); empty inherits the global setting.'),
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
  freshProvider: z.string().default('spawn').volatile().description('Subagent backend for fresh teammates.'),
  forkProvider: z.string().default('fork').volatile().description('Subagent backend for forked teammates.'),
  leadPlaybook: z.string().default('').volatile()
    .description('Optional orchestration playbook appended to the Lead prompt after the role catalog.'),
  activeTemplate: z.string().default('').volatile()
    .description('Identifier of the applied team template; its playbook overrides leadPlaybook when present.'),
  gates: z.array(GateSchema).default([]).volatile()
    .description('Stateful workflow gates: conditionally deny a role tool call until a fresh event exists.'),
  gatesDisabled: z.array(z.string()).default([]).volatile()
    .description('Gate ids manually disabled from /team-gates.'),
  autoFallback: z.boolean().default(true).volatile()
    .description('Automatically switch a member to its role fallback route when its model request fails terminally (for example quota exhausted).'),
  // Deprecated persisted fields. Accepted for compatibility; never read or written by this plugin.
  gateParseRequest: z.object({
    nonce: z.string().default('').description('Client-minted request id; dedupes host work.'),
    text: z.string().default('').description('User description, at most 4000 characters; cleared after the parse.'),
    at: z.number().default(0).description('Epoch milliseconds; requests older than 120 seconds are ignored.'),
  }).default({}).volatile()
    .description('Deprecated and ignored: legacy gate parse request.'),
  gateParseResult: z.object({
    nonce: z.string().default('').description('Request id this result answers.'),
    status: z.string().default('').description('ok | needs-input | error.'),
    gates: z.array(GateSchema).default([]).description('Normalized gate drafts; 0..5.'),
    note: z.string().default('').description('Assumptions or the missing-information note; at most 2000 characters.'),
    warnings: z.array(z.string()).default([]).description('Non-fatal normalization notes; at most 10 x 200 characters.'),
    code: z.string().default('').description('Stable error code for status=error.'),
    detail: z.string().default('').description('English diagnostic detail; at most 500 characters; secondary UI line.'),
    completedAt: z.number().default(0).description('Epoch milliseconds; 0 = no result.'),
  }).default({}).volatile()
    .description('Deprecated and ignored: legacy gate parse result.'),
  codexBackend: z.boolean().default(false).volatile()
    .description('Enable the Codex CLI backend for external-agent teammates (shadow members).'),
  codexBinary: z.string().default('').volatile()
    .description('Codex CLI path; empty auto-detects (config, CODEX_CLI_PATH, WindowsApps package, PATH).'),
  codexModel: z.string().default('').volatile()
    .description('Model passed as -m to Codex; empty keeps the Codex user configuration.'),
  codexSandbox: z.string().default('danger-full-access').volatile()
    .description('Codex sandbox: read-only, workspace-write, or danger-full-access (fully open).'),
  codexTransport: z.string().default('auto').volatile()
    .description('Codex transport: auto (fast then fallback), fast (HTTP-only provider), or default.'),
  codexTimeoutMs: z.number().default(0).volatile()
    .description('Per-turn Codex total budget in milliseconds; 0 uses the transport budget (auto 270s: fast 90s + fallback 180s; fast 90s; default 180s). A positive value overrides the total budget.'),
  codexExtraArgs: z.array(z.string()).default([]).volatile()
    .description('Extra Codex flags (at most 20); controlled arguments such as sandbox/model/cwd are rejected.'),
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
  const settingsLog = new SettingsLog({ dir: stateDir() })
  const rolesReader = {
    // Every role read is also an observation: a change that arrives from the
    // Settings page or a raw profile edit is logged with its field diff, so an
    // unexpected model switch has a trace with a timestamp.
    read: () => {
      const roles = readConfig(config, 'roles') ?? []
      settingsLog.observe(roles)
      return roles
    },
  }
  // Gate events are process-local: a restart empties every bucket, which is the
  // deliberate safe default (no stale approval survives a restart).
  const gateLedger = new GateLedger()
  const codexThreads = new CodexThreadStore()
  // Live handle of every installed member Agent, keyed by "<root>:<member>".
  // switch_member_model uses it to re-select a member's model without touching
  // its session, so primary/fallback share the same conversation context.
  const memberAgents = new Map()
  // Skill disposers of the same live members, so applying settings can swap a
  // role's private skills without re-creating the member.
  const memberSkills = new Map()
  // Model-route overrides keyed by "<root>:<member>". A member Agent is
  // disposed after its turn, so switching a dormant member cannot touch a live
  // Agent; the override is applied by installMember on the next activation,
  // which keeps the same session (and therefore the same context).
  const memberRouteOverrides = new Map()
  // Live Lead Agent handles keyed by team root, for the member-model view.
  const leadAgents = new Map()
  // Session-scoped gate enable/disable overlay: teamId -> Map<gateId, disabled>.
  // The global Config list stays the policy default; this overlay is a per-Team
  // operational decision and dies with the process, like the gate ledger.
  const sessionGateOverrides = new Map()
  const tools = createTools({
    ctx,
    config,
    snapshots,
    rules: ruleStore,
    roles: rolesReader,
    ledger: gateLedger,
    codexThreads,
    memberAgents,
    memberRouteOverrides,
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
  // Seed the editable Lead playbook once: a configured value wins, and the
  // active template's playbook is the fallback. Applying a template copies its
  // playbook into the config so the Settings page can show and edit it.
  const adoptTemplatePlaybook = async () => {
    try {
      if ((readConfig(config, 'leadPlaybook') ?? '').trim() !== '') return
      const active = readConfig(config, 'activeTemplate') ?? ''
      if (active === '') return
      const template = templateCache.items.find((item) => item.id === active)
      const playbook = typeof template?.leadPlaybook === 'string' ? template.leadPlaybook.trim() : ''
      const editor = ctx.get('configEditor')
      if (playbook === '' || editor === undefined) return
      await editor.edit(ctx.fiber.entry, (current) => ({ ...current, leadPlaybook: playbook }))
    } catch (error) {
      ctx.logger?.warn(`[agent-team-roles] playbook adoption failed: ${error.message}`)
    }
  }
  void seedTemplates(templateRoot, builtinTemplatesDir)
    .then(() => loadTemplates(true))
    .then(() => adoptTemplatePlaybook())
    .catch((error) => ctx.logger?.warn(`[agent-team-roles] template seeding failed: ${error.message}`))
  // A late retry covers services that are not ready during activation.
  setTimeout(() => { void adoptTemplatePlaybook() }, 2000)

  // Effective Lead playbook: the configured value wins; the active template's
  // playbook is the fallback. Both may be empty, leaving purely generic rules.
  const leadPlaybook = () => {
    const configured = (readConfig(config, 'leadPlaybook') ?? '').trim()
    if (configured !== '') return configured
    const active = readConfig(config, 'activeTemplate') ?? ''
    if (active !== '') {
      const template = templateCache.items.find((item) => item.id === active)
      if (template !== undefined && template.leadPlaybook.trim() !== '') return template.leadPlaybook
    }
    return ''
  }

  /** Resolve the gate caller's team and role; undefined for non-members. */
  const gateCaller = (agent) => {
    if (agent === undefined) return undefined
    const membership = ctx.agentTeams.tryMembership(agent)
    if (membership === undefined) return undefined
    const roles = mergeRoles(rolesReader.read())
    const snapshot = snapshots.get(membership.root.id, membership.name)
    // D7: Codex-backed members are external Agents and skip gate evaluation
    // entirely, including the user-facing `deny.tool` checks on `codex_exec`.
    if (snapshot?.executor === 'codex') return undefined
    const role = snapshot?.frozen ?? roleForTarget(roles, membership.name)
    if (role === undefined) return undefined
    return { membership, roleId: role.id }
  }

  /** Role ids with a live member in the caller's team right now. */
  const rosterRoles = (agent) => {
    const catalog = mergeRoles(rolesReader.read())
    const live = new Set()
    for (const member of ctx.agentTeams.listMembers(agent)) {
      if (member.role !== 'teammate') continue
      const snapshot = snapshots.get(agent.id, member.name)
      const roleId = snapshot !== undefined ? snapshot.roleId : roleForTarget(catalog, member.name)?.id
      if (roleId !== undefined) live.add(roleId)
    }
    return live
  }

  // Read-side audit: a configured gate the evaluator would silently skip is a
  // real defect, so warn once per gate id per process. This never blocks a call.
  const warnedGateIds = new Set()
  const warnGateOnce = (message, id) => {
    const key = typeof id === 'string' && id !== '' ? id : '#empty'
    if (warnedGateIds.has(key)) return
    warnedGateIds.add(key)
    ctx.logger?.warn(`[agent-team-roles] ${message}`)
  }

  // Host-wide gate enforcement. With no configured gates both listeners return
  // immediately, so existing flows pay nothing and behave identically.
  //
  // Failure philosophy: an evaluator exception fails OPEN (allow + warn). Only
  // a valid configuration whose state is definitely unsatisfied may deny.
  ctx.effect(() => ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      auditGateList(readConfig(config, 'gates') ?? [], warnGateOnce)
    } catch {
      // Diagnostics must not affect the fail-open path.
    }
    let gates
    try {
      gates = normalizeGates(readConfig(config, 'gates') ?? [])
    } catch {
      return next()
    }
    if (gates.length === 0) return next()
    try {
      const caller = gateCaller(exec.agent)
      if (caller === undefined) return next()
      // Applicability: a gate whose key-producing roles have no live member in
      // this team cannot apply — it is unsatisfiable by design, not "unmet".
      // Roster failure fails open like every other evaluator error.
      let liveRoles
      try {
        liveRoles = rosterRoles(exec.agent)
      } catch (error) {
        ctx.logger?.warn(`[agent-team-roles] gate roster check failed open: ${error.message}`)
        return next()
      }
      const applicable = gates.filter((gate) => gateApplicable(gate, liveRoles))
      if (applicable.length === 0) return next()
      const teamId = caller.membership.root.id
      const decision = evaluateGates({
        gates: applicable,
        disabled: effectiveDisabledGates(
          applicable,
          new Set(readConfig(config, 'gatesDisabled') ?? []),
          sessionGateOverrides.get(teamId),
        ),
        role: caller.roleId,
        tool: exec.name,
        args: exec.arguments,
        ledger: gateLedger,
        teamId,
      })
      return decision ?? next()
    } catch (error) {
      ctx.logger?.warn(`[agent-team-roles] gate evaluation failed open: ${error.message}`)
      return next()
    }
  }), 'agent-team-roles:gates-pre-execute')

  ctx.effect(() => ctx.on('tools/post-execute', async (exec, result, next) => {
    try {
      auditGateList(readConfig(config, 'gates') ?? [], warnGateOnce)
    } catch {
      // Diagnostics must not affect the fail-open path.
    }
    const downstream = await next()
    try {
      const gates = normalizeGates(readConfig(config, 'gates') ?? [])
      if (gates.length === 0) return downstream
      const caller = gateCaller(exec.agent)
      if (caller === undefined) return downstream
      const teamId = caller.membership.root.id
      for (const gate of gates) {
        const invalidateOn = gate.require.invalidateOn
        if (invalidateOn !== undefined
          && (invalidateOn.role === undefined || invalidateOn.role === caller.roleId)
          && invalidateOn.tool.includes(exec.name)) {
          // Optional path scoping: a watched tool call voids the team's keys
          // only when the touched path matches. Absent pattern = any path.
          let voids = true
          if (invalidateOn.pathPattern !== undefined) {
            const touched = pathFromArgs(exec.arguments)
            voids = touched !== undefined && new RegExp(invalidateOn.pathPattern).test(touched)
          }
          if (voids) gateLedger.invalidate(teamId)
        }
        const commandSuccess = gate.require.commandSuccess
        if (commandSuccess === undefined
          || commandSuccess.role !== caller.roleId
          || !commandSuccess.tool.includes(exec.name)
          || result?.isError === true) continue
        const command = commandFromArgs(exec.arguments)
        if (typeof command !== 'string') continue
        if (!new RegExp(commandSuccess.pattern).test(command)) continue
        gateLedger.record(teamId, commandSuccessEvent(gate.id), caller.roleId)
      }
    } catch (error) {
      ctx.logger?.warn(`[agent-team-roles] gate bookkeeping failed: ${error.message}`)
    }
    return downstream
  }), 'agent-team-roles:gates-post-execute')

  // Automatic fallback on a terminal model-request failure (quota exhausted, a
  // broken primary provider): switch the member's route to the role fallback and
  // let the same turn retry. Transient failures stay with the harness retry
  // policy. Switching back to the primary route remains a manual Lead decision.
  // Ordered fallback chain: each terminal, route-level failure advances one
  // step. At most MAX_AUTO_SWITCHES_PER_TURN switches happen per turn so a
  // dead chain cannot burn every model's quota in one turn; transient failures
  // stay with the harness retry policy. Returning to the primary route remains
  // a manual Lead decision.
  const MAX_AUTO_SWITCHES_PER_TURN = 2
  const autoFallbackAttempts = new Set()
  const autoFallbackSwitches = new Map()
  ctx.effect(() => ctx.on('agent/request-error', async (payload, next) => {
    try {
      if (!(readConfig(config, 'autoFallback') ?? true)) return next()
      const agent = payload?.agent
      if (agent === undefined) return next()
      const membership = ctx.agentTeams.tryMembership(agent)
      if (membership === undefined || membership.role !== 'teammate') return next()
      const catalog = mergeRoles(rolesReader.read())
      const snapshot = snapshots.get(membership.root.id, membership.name)
      const role = snapshot?.frozen ?? roleForTarget(catalog, membership.name)
      if (role === undefined) return next()
      const chain = roleFallbacks(role)
      if (chain.length === 0) return next()
      const key = `${membership.root.id}:${membership.name}`
      const turnKey = `${key}:${payload.turn}`
      if ((autoFallbackSwitches.get(turnKey) ?? 0) >= MAX_AUTO_SWITCHES_PER_TURN) return next()
      const current = memberRouteOverrides?.get(key) ?? role
      const currentIndex = chain.findIndex((route) =>
        route.provider === current.provider && route.model === current.model)
      const target = chain[currentIndex + 1]
      if (target === undefined) return next()
      const attemptKey = `${turnKey}:${target.provider}/${target.model}`
      if (autoFallbackAttempts.has(attemptKey)) return next()
      if (!shouldAutoSwitch(payload.failure, { alreadyFallback: false })) return next()
      // Bound both memos; turns are monotonic so older keys are useless.
      if (autoFallbackAttempts.size > 500) autoFallbackAttempts.clear()
      if (autoFallbackSwitches.size > 500) autoFallbackSwitches.clear()
      autoFallbackAttempts.add(attemptKey)
      autoFallbackSwitches.set(turnKey, (autoFallbackSwitches.get(turnKey) ?? 0) + 1)
      const selection = modelSelection(target)
      memberRouteOverrides?.set(key, {
        ...selection,
        route: 'fallback',
        fallbackIndex: currentIndex + 1,
        via: 'auto',
        at: Date.now(),
      })
      try {
        agent.model?.select(selection)
      } catch (error) {
        ctx.logger?.warn(`[agent-team-roles] cannot select fallback #${currentIndex + 1} for "${membership.name}": ${error.message}`)
        return next()
      }
      const reason = payload.failure?.message ?? String(payload.failure)
      ctx.logger?.warn(`[agent-team-roles] "${membership.name}" failed on ${payload.provider}; switched to fallback #${currentIndex + 1} ${target.provider}/${target.model} and retried (${reason})`)
      return { kind: 'retry' }
    } catch (error) {
      ctx.logger?.warn(`[agent-team-roles] auto fallback failed open: ${error.message}`)
      return next()
    }
  }), 'agent-team-roles:auto-fallback')

  // A trusted in-process API for other plugins. Agent-facing writes go through
  // the tools above, where the Lead/member boundary is enforced by scope.
  ctx.provide('agentTeamRoles', {
    list: () => roleStore.list(),
    get: (id) => roleStore.get(id),
    create: (role) => {
      settingsLog.note('role-service:create')
      return roleStore.create(role)
    },
    update: (id, patch) => {
      settingsLog.note('role-service:update')
      return roleStore.update(id, patch)
    },
    remove: (id) => {
      settingsLog.note('role-service:remove')
      return roleStore.remove(id)
    },
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
        const applied = installLead({ scoped, register, tools, ctx, snapshots, roles: rolesReader, agent, playbook: leadPlaybook, gateSummary: gateSummaryFor })
        // A Lead whose session preset is not resolved yet (early `agent/created`)
        // installs nothing; do not mark it installed, so the pre-step backstop
        // retries once the session context is complete.
        if (applied === false) {
          dispose()
          return
        }
        // Keep the Lead handle so the member-model view can list this Team.
        if (leadAgents !== undefined) {
          leadAgents.set(agent.id, agent)
          register(() => leadAgents.delete(agent.id))
        }
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
          ctx,
          memberAgents,
          memberSkills,
          memberRouteOverrides,
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
    // Backstop install: a session created while the plugin is already active may
    // resolve its preset and Team membership only after `agent/created`, so the
    // first step re-checks and installs the scoped contributions then.
    if (!installed.has(agent)) {
      try {
        await snapshots.ready
        installAgent(agent)
      } catch (error) {
        ctx.logger?.warn(`[agent-team-roles] cannot install on agent ${agent.id} at pre-step: ${error.message}`)
      }
    }
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
        const editor = ctx.get('configEditor')
        const templateGates = Array.isArray(template.gates) ? template.gates : []
        // Validate and cap before any write: a defective or oversized template
        // must not replace live gates, and roles must not be written first.
        const merged = mergeTemplateGates(readConfig(config, 'gates') ?? [], templateGates)
        if (merged.error !== undefined) {
          return { kind: 'error', text: `template "${template.id}": ${merged.error}` }
        }
        settingsLog.note(`team-template apply: ${template.id}`)
        const applied = await upsertRoles(roleStore, template.roles)
        await editor.edit(ctx.fiber.entry, (current) => ({
          ...current,
          activeTemplate: template.id,
          // Copy the template playbook into the editable config so the Settings
          // page shows it; an edited value keeps winning over the template.
          ...(template.leadPlaybook.trim() === '' ? {} : { leadPlaybook: template.leadPlaybook }),
          ...(templateGates.length === 0 ? {} : { gates: merged.gates }),
        }))
        const skills = await copyTemplateSkills(template.dir, path.join(stateDir(), 'skills'))
        await loadTemplates(true)
        const parts = applied.map((item) => `${item.id} (${item.action})`)
        const skillNote = skills.copied.length === 0 ? 'no skill dirs' : `skills merged: ${skills.copied.join(', ')}`
        const gateNote = templateGates.length === 0 ? 'no gates' : `gates installed: ${templateGates.map((gate) => gate.id).join(', ')}`
        const replacedNote = merged.replaced.length === 0 ? '' : `; replaced: ${merged.replaced.join(', ')}`
        const warningNote = merged.warnings.length === 0 ? '' : `; warnings: ${merged.warnings.join('; ')}`
        return {
          kind: 'success',
          text: `Applied template "${template.id}". Roles: ${parts.join(', ')}. Playbook active. ${gateNote}${replacedNote}${warningNote}. ${skillNote}.`,
        }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  }), 'agent-team-roles:team-template-command')

  // Workflow gates: inspect configured gates, show live key state, toggle them.
  ctx.effect(() => ctx.commands.register({
    name: 'team-gates',
    description: 'Inspect or toggle workflow gates (stateful conditional denial).',
    input: { hint: 'list | status | enable <gate id> | disable <gate id>' },
    handler: async ({ agent, rawInput }) => {
      const membership = ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead') {
        return { kind: 'error', text: 'Only the Team Lead can manage workflow gates.' }
      }
      const presets = ctx.get('agentPresets')
      const presetCandidates = [
        presets?.composedPreset?.(agent.ctx),
        presets?.presetForSession?.(agent.session),
        agent.session?.header?.agentPreset,
      ]
      if (!presetCandidates.includes('team-lead')) {
        return {
          kind: 'error',
          text: 'Workflow gates are available only in a session using the Team Lead preset.',
        }
      }
      const gates = normalizeGates(readConfig(config, 'gates') ?? [])
      const globalDisabled = new Set(readConfig(config, 'gatesDisabled') ?? [])
      const teamId = membership.root.id
      const sessionSummary = () => {
        const overridden = [...(sessionGateOverrides.get(teamId) ?? new Map()).entries()]
        if (overridden.length === 0) return 'session overrides: none (global defaults apply)'
        return 'session overrides: ' + overridden
          .map(([id, off]) => `${id}=${off ? 'off' : 'on'}`)
          .join(', ')
      }
      const sessionMap = () => {
        let map = sessionGateOverrides.get(teamId)
        if (map === undefined) {
          map = new Map()
          sessionGateOverrides.set(teamId, map)
        }
        return map
      }
      const stateOf = (gate) => gateState(globalDisabled, sessionGateOverrides.get(teamId), gate.id)
      let liveRoles
      try {
        liveRoles = rosterRoles(agent)
      } catch (error) {
        liveRoles = undefined
      }
      const applicable = (gate) => gateApplicable(gate, liveRoles)
      const [action, argument] = rawInput.trim().split(/\s+/, 2)
      if (action === 'enable' || action === 'disable') {
        if (argument === undefined || !gates.some((gate) => gate.id === argument)) {
          return { kind: 'error', text: `unknown gate "${argument ?? ''}"` }
        }
        sessionMap().set(argument, action === 'disable')
        return {
          kind: 'success',
          text: `Gate "${argument}" ${action === 'enable' ? 'enabled' : 'disabled'} for THIS session only (cleared on restart). Global defaults change in the plugin settings.`,
        }
      }
      if (gates.length === 0) return { kind: 'success', text: 'No workflow gates configured.' }
      if (action === undefined || action === '' || action === 'list') {
        const lines = gates.map((gate) => {
          const pattern = gate.deny.commandPattern === undefined ? '' : ` /${gate.deny.commandPattern}/`
          const requirement = gate.require.commandSuccess
            ? `successful ${gate.require.commandSuccess.tool.join('/')} command from ${gate.require.commandSuccess.role}`
            : `event "${gate.require.event}" from ${gate.require.byRoles.join('/')}` +
              (gate.require.freshFor === undefined ? '' : ` (fresh ${gate.require.freshFor}s)`)
          const description = gate.description === '' ? '' : ` — ${gate.description}`
          const state = stateOf(gate)
          const flag = !applicable(gate)
            ? '[n/a]  '
            : state === 'off-session'
              ? '[off·群]'
              : state === 'off-global'
                ? '[off·全局]'
                : state === 'on-session' ? '[on·群] ' : '[on]   '
          return `${flag} ${gate.id}: deny ${gate.deny.role} ` +
            `${gate.deny.tool.join('/')}${pattern} ← ${requirement}${description}`
        })
        lines.push('', sessionSummary())
        return { kind: 'success', text: lines.join('\n') }
      }
      if (action !== 'status') {
        return { kind: 'error', text: 'usage: /team-gates list | status | enable <id> | disable <id>' }
      }
      const lines = gates.map((gate) => {
        if (!applicable(gate)) {
          const keyRoles = gateKeyRoles(gate).join(', ')
          const state = stateOf(gate)
          const flag = state === 'off-session' ? '[off·群]' : state === 'off-global' ? '[off·全局]' : '[n/a]  '
          return `${flag} ${gate.id}: inapplicable (no live member with role ${keyRoles})`
        }
        const requirement = gateRequirement(gate)
        if (requirement === undefined) return `${gate.id}: invalid requirement`
        const event = requirement.commandSuccess !== undefined
          ? commandSuccessEvent(gate.id)
          : requirement.event
        const byRoles = requirement.commandSuccess !== undefined
          ? [requirement.commandSuccess.role]
          : requirement.byRoles
        const fresh = gateLedger.fresh(teamId, event, byRoles, requirement.freshFor)
        const latest = gateLedger.latest(teamId, event, byRoles)
        const state = fresh !== undefined
          ? `satisfied (${event} by ${fresh.role} at ${new Date(fresh.at).toISOString()})`
          : latest === undefined
            ? 'unsatisfied (no event recorded)'
            : `unsatisfied (last ${event} by ${latest.role} at ${new Date(latest.at).toISOString()}` +
              `${requirement.freshFor === undefined ? '' : `, expired after ${requirement.freshFor}s`})`
        const gateStateValue = stateOf(gate)
        const flag = gateStateValue === 'off-session'
          ? '[off·群]'
          : gateStateValue === 'off-global'
            ? '[off·全局]'
            : gateStateValue === 'on-session' ? '[on·群] ' : '[on]   '
        return `${flag} ${gate.id}: ${state}`
      })
      lines.push('', sessionSummary())
      return { kind: 'success', text: lines.join('\n') }
    },
  }), 'agent-team-roles:team-gates-command')

  // A dedicated Settings page owns this plugin's form; the generic schema form
  // would duplicate the same volatile fields.
  ctx.inject(['settings'], (scope) => {
    scope.effect(
      () => scope.settings.configure({ auto: false }, ctx.fiber),
      'agent-team-roles:settings-policy',
    )
  })

  const listGateView = (sessionId) => {
    const lead = leadAgents.get(sessionId)
    if (lead === undefined) return undefined
    const gates = normalizeGates(readConfig(config, 'gates') ?? [])
    let liveRoles
    try {
      liveRoles = rosterRoles(lead)
    } catch {
      liveRoles = new Set()
    }
    return buildGateView({
      gates,
      globalDisabled: new Set(readConfig(config, 'gatesDisabled') ?? []),
      sessionMap: sessionGateOverrides.get(sessionId),
      liveRoles,
    })
  }

  /** One-line gate state summary for the Lead prompt. */
  const gateSummaryFor = (teamId) => {
    const view = listGateView(teamId)
    if (view === undefined || view.gates.length === 0) return ''
    const parts = view.gates.map((gate) => {
      if (!gate.applicable) return `${gate.id}=n/a`
      if (gate.state === 'off-session') return `${gate.id}=off(session)`
      if (gate.state === 'off-global') return `${gate.id}=off(global)`
      return `${gate.id}=on`
    })
    return `Current workflow gates: ${parts.join('; ')}.`
  }

  const listMemberRoots = () => {
    const catalog = mergeRoles(rolesReader.read())
    const roots = []
    for (const [rootId, lead] of leadAgents) {
      let roster = []
      try {
        roster = ctx.agentTeams.listMembers(lead)
          .filter((member) => member.role === 'teammate')
          .map((member) => ({ name: member.name, status: member.status }))
      } catch {
        roster = []
      }
      roots.push(buildRootView({
        rootId,
        leadSelection: lead.model?.current?.(),
        roster,
        roleOf: (name) => {
          const snapshot = snapshots.get(rootId, name)
          return snapshot?.frozen ?? roleForTarget(catalog, name)
        },
        liveOf: (name) => memberAgents.get(`${rootId}:${name}`)?.model?.current?.(),
        overrideOf: (name) => memberRouteOverrides.get(`${rootId}:${name}`),
      }))
    }
    return roots
  }

  /**
   * Switch one member's model by hand, scoped to one Team (one session).
   *
   * The selection is applied to a live Agent immediately and recorded as an
   * override so the next activation keeps it; the role definition is not
   * touched, so other Teams and future members keep their configured route.
   */
  function switchMemberModel({ rootId, member, provider, model, reasoningEffort }) {
    const catalog = mergeRoles(rolesReader.read())
    const snapshot = snapshots.get(rootId, member)
    const roleId = snapshot?.roleId ?? roleForTarget(catalog, member)?.id
    if (snapshot === undefined && roleId === undefined) throw new Error(`unknown member "${member}" in this Team`)
    const key = `${rootId}:${member}`
    const selection = modelSelection({ provider, model, reasoningEffort })
    const agent = memberAgents.get(key)
    if (agent !== undefined) {
      try {
        agent.model?.select(selection)
      } catch (error) {
        throw new Error(`cannot select ${provider}/${model} for "${member}": ${error.message}`)
      }
    }
    memberRouteOverrides.set(key, { ...selection, route: 'manual', via: 'lead', at: Date.now() })
    return { rootId, member, roleId: roleId ?? '', ...selection, live: agent !== undefined }
  }

  /**
   * Re-apply Settings changes to every live member.
   *
   * Personas, tool policy, and denyCommands already read the live role per step;
   * this handles the two things captured when a member Agent was created: its
   * model route and its private skills. A member with an explicit Lead route
   * override (a manual or automatic fallback switch) keeps that route.
   */
  function applyLiveSettings() {
    const catalog = mergeRoles(rolesReader.read())
    const applied = []
    for (const [handleKey, agent] of memberAgents) {
      const separator = handleKey.indexOf(':')
      if (separator < 0) continue
      const rootId = handleKey.slice(0, separator)
      const name = handleKey.slice(separator + 1)
      const snapshot = snapshots.get(rootId, name)
      const roleId = snapshot?.roleId ?? roleForTarget(catalog, name)?.id
      const role = roleId === undefined ? undefined : findRole(catalog, roleId)
      if (role === undefined) continue
      const appliedFields = []
      if (memberRouteOverrides.get(handleKey) === undefined && role.provider !== '' && role.model !== '') {
        try {
          agent.model?.select(modelSelection(role))
          appliedFields.push('model')
        } catch (error) {
          ctxWarn(agent, `cannot apply the role route for "${name}": ${error.message}`)
        }
      }
      const previous = memberSkills.get(handleKey)
      if (previous !== undefined) {
        try {
          previous()
          memberSkills.delete(handleKey)
          const next = installRoleSkills(agent, role)
          if (next !== undefined) memberSkills.set(handleKey, next)
          appliedFields.push('skills')
        } catch (error) {
          ctxWarn(agent, `cannot reinstall private skills for "${name}": ${error.message}`)
        }
      }
      applied.push({ member: name, role: role.id, applied: appliedFields })
    }
    settingsLog.note('apply settings')
    return applied
  }

  // Read-only HTTP routes for the Settings page (same origin): installed role
  // skills, the host model catalog that backs the role model dropdown, and the
  // live member-model view shown next to the pull control.
  // Skills are authored by agents, never through these endpoints — GET only.
  ctx.inject(['llm', 'webServer'], (scope) => {
    scope.effect(() => scope.webServer.register(skillRoute()), 'agent-team-roles:skill-routes')
    scope.effect(() => scope.webServer.register(skillRevealRoute(() => scope.get('sessionController'))), 'agent-team-roles:skill-reveal-route')
    scope.effect(() => scope.webServer.register(modelCatalogRoute(scope.llm)), 'agent-team-roles:model-catalog-route')
    scope.effect(() => scope.webServer.register(memberModelsRoute(listMemberRoots)), 'agent-team-roles:member-models-route')
    scope.effect(() => scope.webServer.register(gatesRoute(listGateView)), 'agent-team-roles:gates-view-route')
    scope.effect(() => scope.webServer.register(roleCatalogRoute(() => roleStore.list())), 'agent-team-roles:role-catalog-route')
    scope.effect(() => scope.webServer.register(settingsLogRoute(settingsLog)), 'agent-team-roles:settings-log-route')
    scope.effect(() => scope.webServer.register(settingsLogNoteRoute(settingsLog)), 'agent-team-roles:settings-log-note-route')
    scope.effect(() => scope.webServer.register(memberModelRoute(switchMemberModel)), 'agent-team-roles:member-model-route')
    scope.effect(() => scope.webServer.register(applySettingsRoute(async () => ({
      members: applyLiveSettings(),
      roles: roleStore.list().length,
    }))), 'agent-team-roles:apply-settings-route')
  })
}

/**
 * Whether this session runs the Team Lead preset.
 *
 * The session header is written increasingly late; at `agent/created` it may
 * still be missing. The composed preset and the session-preset resolver are
 * consulted too, exactly like the Lead command gates do, so a freshly created
 * Team Lead session is recognized on the first install.
 */
export function isTeamLeadPreset(agent, ctx) {
  const presets = ctx?.get?.('agentPresets')
  const candidates = [
    agent?.session?.header?.agentPreset,
    presets?.composedPreset?.(agent?.ctx),
    presets?.presetForSession?.(agent?.session),
  ]
  return candidates.includes('team-lead')
}

/** Install the Lead's role catalog, tools, and the official-spawn guard. */
function installLead({ scoped, register, tools, ctx, snapshots, roles, agent, playbook, gateSummary }) {
  // Manual pulls and the team description are Team-Lead-preset features; other
  // presets run plain sessions and must not carry the roster catalog.
  if (!isTeamLeadPreset(agent, ctx)) return false
  register(scoped.systemPrompt.section({
    name: 'agent-team-roles:lead-catalog',
    order: scoped.systemPrompt.getSectionOrder('TEAM_POLICY') + 10,
    text: () => leadCatalog(tools.catalog(), typeof playbook === 'function' ? playbook() : ''),
  }))
  // Current gate state for this Team (global defaults + session overrides), so
  // the Lead knows which locks are live without asking.
  if (typeof gateSummary === 'function') {
    register(scoped.systemPrompt.section({
      name: 'agent-team-roles:lead-gates',
      order: scoped.systemPrompt.getSectionOrder('TEAM_POLICY') + 12,
      text: () => {
        try {
          return gateSummary(agent.id)
        } catch {
          return ''
        }
      },
    }))
  }
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
  return true
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
function installMember({ agent, membership, scoped, register, tools, snapshots, ruleStore, roles, ctx, memberAgents, memberSkills, memberRouteOverrides }) {
  const snapshot = snapshots.get(membership.root.id, membership.name)
  // D7: Codex members are relay Agents for an external process. They keep only
  // codex_exec + collaboration tools, get the relay persona, and never register
  // report_gate_event or any role denyCommands guard.
  if (snapshot?.executor === 'codex') {
    installCodexMember({ agent, membership, scoped, register, tools, snapshots, roles, ctx, memberAgents })
    return
  }
  const role = roleForMember(snapshot, tools.catalog(), membership.name)
  if (role === undefined) return
  const roleId = role.id
  const frozen = snapshot?.frozen ?? role

  // Keep the live Agent handle so the Lead can re-select its model later while
  // preserving the member's session context.
  const handleKey = `${membership.root.id}:${membership.name}`
  if (memberAgents !== undefined) {
    memberAgents.set(handleKey, agent)
    register(() => memberAgents.delete(handleKey))
  }

  // A Lead-requested route override (for example switching to the fallback
  // model after a quota failure) wins over the frozen role route. Members are
  // disposed between turns, so applying it here — on the next activation — is
  // what lets primary and fallback share one conversation context.
  const override = memberRouteOverrides?.get(handleKey)
  const route = override !== undefined ? override : frozen
  if (route.provider !== '' && route.model !== '') {
    try {
      agent.model?.select(modelSelection(route))
    } catch (error) {
      ctxWarn(agent, `cannot select the role route for "${membership.name}": ${error.message}`)
    }
  }

  register(scoped.systemPrompt.section({
    name: 'agent-team-roles:member-persona',
    order: scoped.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 100,
    text: () => {
      // Prefer the live definition, with the frozen snapshot as a fallback.
      const persona = memberPersona({
        frozen: findRole(mergeRoles(roles.read()), roleId) ?? frozen,
        rulesText: ruleStore.render(roleId, membership.root.id),
        target: membership.name,
      })
      return roleId === 'tse' ? `${persona}\n\n${TSE_BROWSER_GUIDANCE}` : persona
    },
  }))

  // Both guards resolve the role per call: a tool-policy or denyCommands edit in
  // Settings therefore applies to this member on its very next tool call, with
  // no re-spawn and no refresh.
  const liveRoleOf = () => findRole(mergeRoles(roles.read()), roleId) ?? frozen
  register(scoped.tools.guard((exec) => evaluateDeny(liveRoleOf(), exec.name, exec.arguments)))
  // Preset tools can register after agent/created. A visibility mask computed
  // here would permanently hide later-registered tools, so visibility is left
  // to the preset and the per-call guard enforces the role allow-list.
  register(scoped.tools.guard((exec) => {
    const liveRole = liveRoleOf()
    if (liveRole.toolMode !== 'custom') return undefined
    if (nativeMemberAllowList(roleId, liveRole.tools).has(exec.name)) return undefined
    return `Tool "${exec.name}" is not allowed by role "${roleId}".`
  }))

  for (const definition of tools.member) register(scoped.tools.register(definition))
  register(scoped.tools.guard((exec) => {
    if (exec.name !== 'spawn_teammate') return undefined
    return 'Only the Team Lead can create teammates, and this Team uses spawn_team_member with a configured role.'
  }))

  try {
    const disposeSkills = installRoleSkills(agent, liveRoleOf())
    if (disposeSkills !== undefined && memberSkills !== undefined) {
      memberSkills.set(handleKey, disposeSkills)
      register(() => {
        memberSkills.delete(handleKey)
        disposeSkills()
      })
    } else if (disposeSkills !== undefined) {
      register(disposeSkills)
    }
  } catch (error) {
    ctxWarn(agent, `cannot install private skills for role "${roleId}": ${error.message}`)
  }
}

/**
 * Install a Codex-backed relay member (D7).
 *
 * Codex members get the relay persona, `codex_exec`, collaboration and
 * read-only memory and web lookup, and **no** gate participation: no `report_gate_event`, no role tool
 * whitelist, no denyCommands guard, no private skills.
 */
function installCodexMember({ agent, membership, scoped, register, tools, snapshots, roles }) {
  const snapshot = snapshots.get(membership.root.id, membership.name)
  const frozen = snapshot?.frozen ?? findRole(mergeRoles(roles.read()), roleForTarget(mergeRoles(roles.read()), membership.name)?.id ?? '')
    ?? findRole(mergeRoles(roles.read()), membership.name)
    ?? { id: snapshot?.roleId ?? membership.name, name: membership.name, description: '', persona: '', provider: '', model: '' }
  register(scoped.systemPrompt.section({
    name: 'agent-team-roles:member-persona',
    order: scoped.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 100,
    text: () => memberPersona({
      frozen: findRole(mergeRoles(roles.read()), frozen.id) ?? frozen,
      rulesText: '',
      target: membership.name,
      executor: 'codex',
    }),
  }))
  const allowed = new Set(CODEX_MEMBER_TOOLS)
  register(scoped.tools.guard((exec) => {
    if (allowed.has(exec.name)) return undefined
    return `Tool "${exec.name}" is not available to a Codex-backed member; use codex_exec, send_message, or team_task_*.`
  }))
  for (const definition of tools.codexMember) register(scoped.tools.register(definition))
}

/** Warn through the Agent's logger when one is reachable. */
function ctxWarn(agent, message) {
  agent.ctx?.logger?.warn(`[agent-team-roles] ${message}`)
}

export { stateDir }
