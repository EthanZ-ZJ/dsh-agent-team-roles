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
import { LEAD_ROLE_ID, findRole, mergeRoles, readConfig, roleFallbacks, roleForTarget } from './config.js'
import { activeMembers, leadCatalog, leadMemoryGuide, leadRoutingGuide, leadWorkflowGuide, memberPersona } from './prompts.js'
import { leadDelegateReason, leadToolPolicy } from './lead-policy.js'
import {
  SELF_SERVICE_TOOLS,
  createLeadWorkflowCounter,
  leadWorkflowPolicy,
  preDispatchRefusal,
  selfWorkRefusal,
} from './lead-workflow.js'
import { routeTask, routerPolicy } from './router.js'
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
import { buildRootView, configuredRoute, memberModelsRoute, memberSwitchRoutes, modelSelection } from './member-models.js'
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

/** One ordered model route; shared by a role's fallback chain and model-chain templates. */
const FallbackRouteSchema = z.object({
  provider: z.string().default(''),
  model: z.string().default(''),
  reasoningEffort: z.string().default(''),
})

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
  fallbacks: z.array(FallbackRouteSchema).default([]).description('Ordered fallback routes tried in order; empty keeps the legacy single fallback fields.'),
  toolMode: z.string().default('all').description('Tool policy: all, or a custom allow-list.'),
  tools: z.array(z.string()).default([]).description('Allowed tool names when toolMode is custom.'),
  denyCommands: z.array(z.string()).default([])
    .description('Optional RegExp sources denying matching shell commands for this role (at most 20 patterns of 200 characters).'),
  skills: z.array(z.string()).default([]).description('Private skill names; empty exposes the whole role skill folder.'),
  codexSandbox: z.string().default('')
    .description('Role-level Codex sandbox override (read-only / workspace-write / danger-full-access); empty inherits the global setting.'),
  color: z.string().default('').description('Accent color for the roster.'),
})

/**
 * One named model-chain template: a primary route plus ordered fallbacks.
 *
 * Templates are settings data, not runtime policy: the Settings page applies one
 * to the selected roles, which then persist as ordinary role routes. They live in
 * the same Config as the catalog so a save from one page never rewrites the other.
 */
const ModelChainTemplateSchema = z.object({
  name: z.string().default('').description('Unique template name shown in the settings picker.'),
  provider: z.string().default('').description('Primary provider route.'),
  model: z.string().default('').description('Primary model id.'),
  reasoningEffort: z.string().default('').description('Primary reasoning effort; empty keeps the adapter default.'),
  fallbacks: z.array(FallbackRouteSchema).default([])
    .description('Ordered fallback routes tried in order; empty means no fallback chain.'),
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
  modelChainTemplates: z.array(ModelChainTemplateSchema).default([]).volatile()
    .description('Named model-chain templates saved from the Settings page; each bundles a primary route and ordered fallbacks for applying to roles.'),
  rules: z.array(RuleSchema).default([]).volatile().description('Learned standing rules.'),
  leadWorkflowMode: z.string().default('dispatch-first').volatile()
    .description('Lead turn protocol: dispatch-first enforces the per-turn self-check budget; off disables it.'),
  leadSelfWorkBudget: z.number().default(3).volatile()
    .description('Maximum self-check tool calls (read/grep/glob/read_image) the Team Lead may make per turn.'),
  leadPreDispatchBudget: z.number().default(1).volatile()
    .description('Self-check calls the Team Lead may make before its first dispatch in a turn.'),
  leadToolMode: z.string().default('hide').volatile()
    .description('Team Lead tool policy: hide (remove implementation tools), deny (keep them visible but refuse with a routing reminder), or off.'),
  leadToolDeny: z.array(z.string()).default([]).volatile()
    .description('Extra tool names the Team Lead may not call, appended to the built-in implementation list.'),
  routerMode: z.string().default('model').volatile()
    .description('Routing decision mode: model (call the dedicated router model), rules (keyword routing only), or off (route_task fails).'),
  routerProvider: z.string().default('').volatile()
    .description('Provider for the routing decision model; empty means no model call and rule routing is used.'),
  routerModel: z.string().default('').volatile()
    .description('Model id for the routing decision model; empty means no model call and rule routing is used.'),
  routerReasoningEffort: z.string().default('').volatile()
    .description('Reasoning effort for the routing decision model; empty uses the adapter default.'),
  routerTimeoutMs: z.number().default(20000).volatile()
    .description('Timeout for one routing model call in milliseconds; invalid values fall back to 20000.'),
  routerMaxTokens: z.number().default(800).volatile()
    .description('Maximum output tokens for one routing model call; invalid values fall back to 800.'),
  routerRequireDecision: z.boolean().default(true).volatile()
    .description('Require a successful route_task in the current turn before spawn_team_member is allowed.'),
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
  // Current turn per Lead Agent: the workflow guard resets its per-turn budget
  // when this changes, so no turn-end event is needed.
  const leadTurns = new Map()
  // Successful route decisions per Lead turn, keyed "<agentId>:<turn>". The
  // routing guard reads this set to require route_task before spawn_team_member.
  const routeDecisions = new Set()
  // Session-scoped gate enable/disable overlay: teamId -> Map<gateId, disabled>.
  // The global Config list stays the policy default; this overlay is a per-Team
  // operational decision and dies with the process, like the gate ledger.
  const sessionGateOverrides = new Map()

  /**
   * Call the dedicated routing model once and return its text.
   *
   * The router is optional infrastructure: an unavailable `llm` service or an
   * empty provider/model throws, which makes routeTask fall back to rule
   * routing. The stream is aborted after policy.timeoutMs.
   */
  const routerCall = async ({ system, messages, policy }) => {
    if (policy.provider === '' || policy.model === '') throw new Error('router provider/model is not configured')
    const llm = ctx.get('llm')
    if (llm === undefined) throw new Error('llm service is unavailable')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(1, policy.timeoutMs))
    if (typeof timer.unref === 'function') timer.unref()
    try {
      let text = ''
      let finish
      for await (const chunk of llm.stream({
        provider: policy.provider,
        model: policy.model,
        ...(policy.reasoningEffort === '' ? {} : { reasoningEffort: policy.reasoningEffort }),
        messages,
        system,
        maxTokens: policy.maxTokens,
        temperature: 0,
        signal: controller.signal,
      })) {
        if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
        else if (chunk?.type === 'finish') finish = chunk.reason
      }
      if (finish !== undefined && finish.kind !== 'stop' && finish.kind !== 'max-tokens') {
        throw new Error(`router model call ended with ${finish.kind}${finish.failure?.code ? ` (${finish.failure.code})` : ''}`)
      }
      return text
    } finally {
      clearTimeout(timer)
    }
  }

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
    router: {
      policy: () => routerPolicy({
        mode: readConfig(config, 'routerMode'),
        provider: readConfig(config, 'routerProvider'),
        model: readConfig(config, 'routerModel'),
        reasoningEffort: readConfig(config, 'routerReasoningEffort'),
        timeoutMs: readConfig(config, 'routerTimeoutMs'),
        maxTokens: readConfig(config, 'routerMaxTokens'),
      }),
      route: (request) => routeTask({ ...request, callModel: routerCall }),
      markDecision: (agent) => {
        if (agent?.id === undefined) return
        const key = `${agent.id}:${leadTurns.get(agent.id) ?? 0}`
        // Only the current turn can satisfy the guard; drop earlier turns so a
        // long-lived Lead does not accumulate one key per turn.
        for (const entry of [...routeDecisions]) {
          if (entry.startsWith(`${agent.id}:`) && entry !== key) routeDecisions.delete(entry)
        }
        routeDecisions.add(key)
      },
    },
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
    // Gates are a Team Lead preset workflow: a plain session's official roster
    // must not be governed by the configured Team gates.
    if (!isTeamLeadPreset(membership.root, ctx)) return undefined
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
      // Role fallback chains are role configuration: only a Team Lead preset
      // root gives its teammates the configured Team roles.
      if (!isTeamLeadPreset(membership.root, ctx)) return next()
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

  /**
   * One reversible installation per Agent, keyed by the mode it was built for.
   *
   * A Session may switch preset before its first turn, and a child may be
   * composed later than `agent/created`; a one-shot install would either leak a
   * Team surface into a plain session or never appear after such a switch. Every
   * install is therefore disposable and reconciled against the effective preset.
   */
  const installed = new Map()
  const disposedAgents = new WeakSet()
  let ready = false
  let stopped = false
  let reconciling = false

  /**
   * The install mode one Agent must have right now.
   *
   * - `lead`: the live Agent is the official Lead of a Team Lead preset session.
   * - `member`: a teammate whose root session runs the Team Lead preset.
   * - `none`: a resolved composition without a Team surface (including a
   *   teammate of a non-Team session: role configuration fails closed).
   * - `defer`: no preset signal yet; install nothing and retry on the next step.
   */
  function desiredInstallMode(agent) {
    let membership
    try {
      membership = ctx.agentTeams.tryMembership(agent)
    } catch {
      return 'none'
    }
    if (membership === undefined) return 'none'
    const root = membership.role === 'lead' ? agent : membership.root
    if (isTeamLeadPreset(root, ctx)) return membership.role === 'lead' ? 'lead' : 'member'
    return hasResolvedPreset(root, ctx) ? 'none' : 'defer'
  }

  /** Guard against tools/change emitted by our own registrations or disposals. */
  function reconcileAgent(agent) {
    if (stopped || reconciling || disposedAgents.has(agent)) return
    reconciling = true
    try {
      reconcileScope(agent)
    } finally {
      reconciling = false
    }
  }

  /** Install, remove, or keep one Agent's contributions to match its preset. */
  function reconcileScope(agent) {
    const desired = desiredInstallMode(agent)
    const current = installed.get(agent)
    if (current !== undefined && current.mode === desired) return
    if (current !== undefined) {
      installed.delete(agent)
      try {
        current.dispose()
      } catch {
        // Descriptors removed by a disposing scope must not block reconciling.
      }
    }
    if (desired === 'none' || desired === 'defer') return
    const scoped = agent.ctx
    if (scoped === undefined) return
    const membership = ctx.agentTeams.tryMembership(agent)
    if (membership === undefined) return

    const disposers = []
    let active = true
    const register = (disposer) => {
      if (typeof disposer !== 'function') return
      if (active) disposers.push(disposer)
      else disposer()
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
    }

    // Tool admission and section rendering both precede agent/pre-step.
    // Check the live preset there too, while a rebind is between updating its
    // scope and notifying the registry observers that remove the old overlay.
    const presetMatches = () => isTeamLeadPreset(membership.root, ctx)
    const installerScope = {
      tools: {
        register: (definition) => scoped.tools.register(definition, { when: presetMatches }),
        guard: (predicate) => scoped.tools.guard(predicate),
        restrict: (filter) => scoped.tools.restrict(filter),
      },
      systemPrompt: {
        getSectionOrder: (name) => scoped.systemPrompt.getSectionOrder(name),
        section: (definition) => {
          const text = typeof definition.text === 'function' ? definition.text : () => definition.text
          return scoped.systemPrompt.section({
            ...definition,
            text: (...args) => (presetMatches() ? text(...args) : ''),
          })
        },
      },
    }
    // A tool set admitted before the rebind may still reach the executor.
    const definitions = desired === 'lead' ? tools.lead : [...tools.member, ...tools.codexMember]
    const teamToolNames = new Set(definitions.map((definition) => definition.name))
    register(scoped.tools.guard((exec) => {
      if (presetMatches() || !teamToolNames.has(exec.name)) return undefined
      return 'Team tools are available only in a Team Lead preset session.'
    }))

    try {
      if (desired === 'lead') {
        installLead({ scoped: installerScope, register, tools, ctx, config, snapshots, roles: rolesReader, ruleStore, agent, playbook: leadPlaybook, gateSummary: gateSummaryFor, turnOf: () => leadTurns.get(agent.id) ?? 0, routeDecisions })
        // The commands service requires a command-injected child of agent.ctx
        // for scoped discovery. Injection activates asynchronously, and fiber
        // teardown is asynchronous too: own the exact registration disposers
        // so the old commands disappear synchronously on a preset rebind.
        const commandFiber = scoped.inject?.(['commands'], (commandCtx) => {
          for (const definition of [teamSpawnCommand, teamTemplateCommand, teamGatesCommand]) {
            if (!active || !presetMatches()) return
            register(commandCtx.commands.register(definition))
          }
        })
        if (commandFiber !== undefined) {
          register(() => {
            void Promise.resolve(commandFiber.dispose()).catch((error) => {
              ctx.logger?.warn(`[agent-team-roles] cannot dispose commands for agent ${agent.id}: ${error.message}`)
            })
          })
        }
        // Keep the Lead handle so the member-model view can list this Team.
        leadAgents.set(agent.id, agent)
        register(() => leadAgents.delete(agent.id))
      } else {
        installMember({
          agent,
          membership,
          scoped: installerScope,
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

    const release = scoped.effect(() => dispose, 'agent-team-roles:agent')
    installed.set(agent, {
      mode: desired,
      dispose: () => {
        if (typeof release === 'function') release()
        dispose()
      },
    })
  }

  const onCreated = async ({ agent }) => {
    await snapshots.ready
    reconcileAgent(agent)
  }
  const onDisposed = ({ agent }) => {
    disposedAgents.add(agent)
    const handle = installed.get(agent)
    installed.delete(agent)
    try {
      handle?.dispose()
    } catch {
      // The scope is already unwinding.
    }
    leadTurns.delete(agent.id)
    for (const key of [...routeDecisions]) {
      if (key.startsWith(`${agent.id}:`)) routeDecisions.delete(key)
    }
  }

  ctx.on('agent/created', onCreated)
  ctx.on('agent/disposed', onDisposed)
  ctx.effect(() => () => {
    stopped = true
    for (const [agent, handle] of [...installed]) {
      installed.delete(agent)
      try {
        handle.dispose()
      } catch {
        // Plugin unload is best-effort for already-disposed scopes.
      }
    }
    installed.clear()
  }, 'agent-team-roles:installed')

  function reconcileLiveAgents() {
    if (!ready || stopped || reconciling) return
    for (const agent of ctx.agents.list()) {
      try {
        reconcileAgent(agent)
      } catch (error) {
        ctx.logger?.warn(`[agent-team-roles] cannot reconcile agent ${agent.id}: ${error.message}`)
      }
    }
  }

  void snapshots.ready.then(() => {
    ready = true
    reconcileLiveAgents()
  })

  // recompose emits tools/change after rebinding a live scope; unlike select,
  // it does not commit agent-preset/selected. Reconcile synchronously so the
  // next assembly, command list, or private-skill list uses the new scope.
  // The notification has no scope argument, so check all live Agents, including
  // those whose role surface depends on the changed Agent being their root.
  ctx.on('tools/change', reconcileLiveAgents)
  ctx.on('agent-preset/selected', reconcileLiveAgents)

  ctx.effect(() => ctx.on('agent/pre-step', async ({ agent, messages, turn }, next) => {
    leadTurns.set(agent.id, turn)
    // Backstop reconcile: the preset may resolve after `agent/created`, and a
    // live composition may be rebound without a selection event. Unresolved
    // presets therefore retry here instead of installing early.
    try {
      await snapshots.ready
      reconcileAgent(agent)
    } catch (error) {
      ctx.logger?.warn(`[agent-team-roles] cannot install on agent ${agent.id} at pre-step: ${error.message}`)
    }
    if (desiredInstallMode(agent) !== 'lead' || !Array.isArray(messages) || !isHandshakeOnly(messages)) {
      return next()
    }
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    return { ...decision, messages: [] }
  }), 'agent-team-roles:handshake-pre-step')

  // The Web composer's pull control invokes this command through the existing
  // commands Remote, so a member is created without a model turn.
  const teamSpawnCommand = {
    name: 'team-spawn',
    description: 'Pull a configured role as a teammate without a model turn.',
    input: { hint: '<role> [task]' },
    handler: async ({ agent, rawInput, signal }) => {
      const membership = ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead') {
        return { kind: 'error', text: 'Only the Team Lead can spawn teammates.' }
      }
      if (!isTeamLeadPreset(agent, ctx)) {
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
  }

  // Team template management: list discovered packs, apply one by upserting its
  // roles into the live catalog, activating its playbook, and merging its
  // private skills. Lead-only, like every catalog mutation.
  const teamTemplateCommand = {
    name: 'team-template',
    description: 'List or apply team templates (role catalog + Lead playbook).',
    input: { hint: 'list | apply <template id>' },
    handler: async ({ agent, rawInput }) => {
      const membership = ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead') {
        return { kind: 'error', text: 'Only the Team Lead can manage team templates.' }
      }
      // Align with /team-spawn: template management is a Team-Lead-preset feature.
      if (!isTeamLeadPreset(agent, ctx)) {
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
  }

  // Workflow gates: inspect configured gates, show live key state, toggle them.
  const teamGatesCommand = {
    name: 'team-gates',
    description: 'Inspect or toggle workflow gates (stateful conditional denial).',
    input: { hint: 'list | status | enable <gate id> | disable <gate id>' },
    handler: async ({ agent, rawInput }) => {
      const membership = ctx.agentTeams.tryMembership(agent)
      if (membership?.role !== 'lead') {
        return { kind: 'error', text: 'Only the Team Lead can manage workflow gates.' }
      }
      if (!isTeamLeadPreset(agent, ctx)) {
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
  }

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
          // The live definition wins so an edit is visible immediately; the
          // frozen snapshot only covers a deleted role.
          const snapshot = snapshots.get(rootId, name)
          return (snapshot === undefined ? undefined : findRole(catalog, snapshot.roleId))
            ?? snapshot?.frozen
            ?? roleForTarget(catalog, name)
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
  function switchMemberModel(request) {
    // Same preset boundary as the prompt/tool surface: only a live Team Lead
    // session owns members and their routes. A stale panel or a direct caller
    // naming another session must not reach a member surface there.
    if (!leadAgents.has(request.rootId)) {
      throw new Error(`session "${request.rootId}" is not a Team Lead session`)
    }
    if (request.clear === true) return clearMemberModel(request)
    const { rootId, member, provider, model, reasoningEffort } = request
    const catalog = mergeRoles(rolesReader.read())
    const snapshot = snapshots.get(rootId, member)
    const roleId = snapshot?.roleId ?? roleForTarget(catalog, member)?.id
    if (snapshot === undefined && roleId === undefined) throw new Error(`unknown member "${member}" in this Team`)
    // Only the role's configured routes are switchable: the picker offers them
    // and the host enforces the same list, so a stale page cannot invent one.
    const liveRole = roleId === undefined ? undefined : findRole(catalog, roleId)
    const allowed = memberSwitchRoutes(liveRole ?? snapshot?.frozen)
    const configured = configuredRoute(liveRole ?? snapshot?.frozen, provider, model)
    if (configured === undefined) {
      const names = allowed.map((route) => `${route.provider}/${route.model}`).join(', ')
      throw new Error(`"${provider}/${model}" is not configured for role "${roleId ?? member}"; configured routes: ${names || '(none)'}`)
    }
    const key = `${rootId}:${member}`
    const selection = modelSelection({ provider: configured.provider, model: configured.model, reasoningEffort })
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
   * Drop a manual switch so the member follows its role route again.
   *
   * Without this the override would outlive its purpose and mask every later
   * role or Settings change for that member in this Team.
   */
  function clearMemberModel({ rootId, member }) {
    const key = `${rootId}:${member}`
    const catalog = mergeRoles(rolesReader.read())
    const snapshot = snapshots.get(rootId, member)
    const roleId = snapshot?.roleId ?? roleForTarget(catalog, member)?.id
    if (snapshot === undefined && roleId === undefined) throw new Error(`unknown member "${member}" in this Team`)
    memberRouteOverrides.delete(key)
    const role = roleId === undefined ? undefined : findRole(catalog, roleId)
    const agent = memberAgents.get(key)
    if (agent !== undefined && role !== undefined) {
      try {
        agent.model?.select(modelSelection(role))
      } catch (error) {
        throw new Error(`cannot restore the role route for "${member}": ${error.message}`)
      }
    }
    return { rootId, member, roleId: roleId ?? '', provider: role?.provider ?? '', model: role?.model ?? '', reasoningEffort: role?.reasoningEffort ?? '', live: agent !== undefined, cleared: true }
  }

  /**
   * Re-apply Settings changes to every member of every Team.
   *
   * A live member is re-selected in place. A member that is idle has no Agent
   * to touch, so its frozen snapshot is rebased onto the current role — that
   * snapshot is what the next activation reads, and it is also what the panel
   * and the member-model view show while the member sleeps.
   */
  async function applyLiveSettings({ rootId } = {}) {
    const catalog = mergeRoles(rolesReader.read())
    const applied = []
    const seen = new Set()
    const roleOfMember = (rootId, name) => {
      const snapshot = snapshots.get(rootId, name)
      const roleId = snapshot?.roleId ?? roleForTarget(catalog, name)?.id
      if (roleId === undefined) return { roleId: undefined, role: undefined }
      return { roleId, role: findRole(catalog, roleId) }
    }
    for (const [teamRootId, lead] of leadAgents) {
      if (rootId !== undefined && teamRootId !== rootId) continue
      let roster = []
      try {
        roster = ctx.agentTeams.listMembers(lead)
          .filter((member) => member.role === 'teammate')
          .map((member) => member.name)
      } catch {
        roster = []
      }
      for (const name of roster) {
        const key = `${teamRootId}:${name}`
        if (seen.has(key)) continue
        seen.add(key)
        const { roleId, role } = roleOfMember(teamRootId, name)
        if (role === undefined) continue
        const appliedFields = []
        const agent = memberAgents.get(key)
        if (agent !== undefined) {
          if (memberRouteOverrides.get(key) === undefined && role.provider !== '' && role.model !== '') {
            try {
              agent.model?.select(modelSelection(role))
              appliedFields.push('model')
            } catch (error) {
              ctxWarn(agent, `cannot apply the role route for "${name}": ${error.message}`)
            }
          }
          const previous = memberSkills.get(key)
          if (previous !== undefined) {
            try {
              previous()
              memberSkills.delete(key)
              const next = installRoleSkills(agent, role, () => teamPresetActive(lead, ctx))
              if (next !== undefined) memberSkills.set(key, next)
              appliedFields.push('skills')
            } catch (error) {
              ctxWarn(agent, `cannot reinstall private skills for "${name}": ${error.message}`)
            }
          }
        } else {
          // Idle member: rebase the snapshot it will activate from.
          try {
            await snapshots.rebase(teamRootId, name, role)
            appliedFields.push('pending')
          } catch (error) {
            ctx.logger?.warn(`[agent-team-roles] cannot rebase the snapshot for "${name}": ${error.message}`)
          }
        }
        applied.push({ member: name, role: role.id, live: agent !== undefined, applied: appliedFields })
      }
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
    scope.effect(() => scope.webServer.register(applySettingsRoute(async (request) => ({
      members: await applyLiveSettings(request),
      roles: roleStore.list().length,
    }))), 'agent-team-roles:apply-settings-route')
  })
}

/** The only Agent preset whose sessions may carry this plugin's Team surface. */
export const TEAM_LEAD_PRESET = 'team-lead'

/**
 * The preset one live Agent actually runs.
 *
 * The live composition is authoritative: a Session header records the preset it
 * was created with, and a blank session may switch before its first turn, so a
 * stale header must not win over `composedPreset`. The durable selection and,
 * last, the header cover a composition the preset service cannot report yet.
 *
 * @param agent - exact live Agent.
 * @param ctx - plugin context owning the optional `agentPresets` service.
 * @returns the preset id, or undefined while no signal has resolved.
 */
export function effectiveAgentPreset(agent, ctx) {
  const presets = ctx?.get?.('agentPresets')
  const resolved = (value) => typeof value === 'string' && value !== ''
  try {
    const composed = presets?.composedPreset?.(agent?.ctx)
    if (resolved(composed)) return composed
  } catch {
    // A disposing Agent context cannot report a composition.
  }
  try {
    const selected = presets?.presetForSession?.(agent?.session)
    if (resolved(selected)) return selected
  } catch {
    // A detached Session cannot report a selection.
  }
  const initial = agent?.session?.header?.agentPreset
  return resolved(initial) ? initial : undefined
}

/** Whether the Agent's effective composition is the Team Lead preset. */
export function isTeamLeadPreset(agent, ctx) {
  return effectiveAgentPreset(agent, ctx) === TEAM_LEAD_PRESET
}

/**
 * Whether the preset is resolved at all.
 *
 * An unresolved preset must not receive a Team surface and must retry later,
 * while any resolved non-Team preset is a definitive "no".
 */
function hasResolvedPreset(agent, ctx) {
  return effectiveAgentPreset(agent, ctx) !== undefined
}

/**
 * Whether a scope can resolve a live preset.
 *
 * Every live Agent scope exposes `get`; a bare scope handed straight to an
 * installer (unit tests) cannot, and its guard must stay active there.
 */
function presetGateApplies(ctx) {
  return typeof ctx?.get === 'function'
}

/** Whether the Agent (or a member's root) may currently carry the Team surface. */
function teamPresetActive(agent, ctx) {
  return !presetGateApplies(ctx) || isTeamLeadPreset(agent, ctx)
}

/** Lead tools that record, list, and retire Lead memory; Team-Lead-preset only. */
const LEAD_MEMORY_TOOLS = ['record_role_feedback', 'list_role_rules', 'forget_role_rule']

/**
 * Keep the Lead out of implementation work.
 *
 * `hide` removes the global implementation tools from the Lead's visible tool
 * list, so the model never sees them. Scoped tools and the reserved `run_code`
 * transport cannot be restricted, so a guard turns every remaining call into a
 * model-facing reminder to route the work to a role. The policy is read live, so
 * switching it to `deny` or `off` in Settings applies on the next tool call.
 */
/**
 * Enforce the dispatch-first turn protocol.
 *
 * The Lead may self-check a little before assigning work and a little more after
 * dispatching, but it must hand the investigation to the member that owns it
 * instead of reasoning over the code itself. Counters are per turn; a refusal is
 * a model-facing instruction, not a silent failure.
 */
export function installLeadWorkflow({ scoped, register, agent, config, turnOf, ctx }) {
  const counter = createLeadWorkflowCounter()
  const live = () => leadWorkflowPolicy({
    mode: readConfig(config, 'leadWorkflowMode'),
    selfBudget: readConfig(config, 'leadSelfWorkBudget'),
    preDispatchBudget: readConfig(config, 'leadPreDispatchBudget'),
  })
  register(scoped.tools.guard((exec) => {
    if (!teamPresetActive(agent, ctx)) return undefined
    const policy = live()
    if (policy.mode === 'off') return undefined
    counter.reset(typeof turnOf === 'function' ? turnOf() : 0)
    if (counter.observeDispatch(exec.name)) return undefined
    if (!SELF_SERVICE_TOOLS.includes(exec.name)) return undefined
    const used = counter.use()
    if (!counter.dispatched && used > policy.preDispatchBudget) return preDispatchRefusal(policy.preDispatchBudget)
    if (used > policy.selfBudget) return selfWorkRefusal(policy.selfBudget)
    return undefined
  }))
  register(scoped.systemPrompt.section({
    name: 'agent-team-roles:lead-workflow',
    order: scoped.systemPrompt.getSectionOrder('TEAM_POLICY') + 6,
    text: () => {
      const policy = live()
      return policy.mode === 'off' ? '' : leadWorkflowGuide(policy)
    },
  }))
}

/**
 * Routing discipline: route before dispatching.
 *
 * The router itself is a tool (`route_task`); this installer adds the prompt
 * instruction and the per-turn guard that makes the instruction structural:
 * with `routerRequireDecision` on, `spawn_team_member` is refused until a
 * route_task succeeds for the current turn.
 */
export function installLeadRouter({ scoped, register, agent, config, routeDecisions, turnOf, ctx }) {
  const requireDecision = () => readConfig(config, 'routerRequireDecision') !== false
  register(scoped.systemPrompt.section({
    name: 'agent-team-roles:lead-router',
    order: scoped.systemPrompt.getSectionOrder('TEAM_POLICY') + 13,
    text: () => (requireDecision()
      ? 'Before dispatching, call `route_task` with the task and the minimum context. Dispatch with the roleId it returns and do not choose a role yourself. When `needsSplit` is non-empty, dispatch each returned item.'
      : 'When you are unsure which role should receive a task, call `route_task`; do not choose a role by guesswork.'),
  }))
  register(scoped.tools.guard((exec) => {
    if (exec.name !== 'spawn_team_member') return undefined
    if (!teamPresetActive(agent, ctx)) return undefined
    if (!requireDecision()) return undefined
    const turn = typeof turnOf === 'function' ? turnOf() : 0
    if (routeDecisions !== undefined && routeDecisions.has(`${agent.id}:${turn}`)) return undefined
    return 'Call route_task before spawn_team_member: put the task through the router and dispatch with the roleId it returns. Do not choose a role yourself.'
  }))
}

export function installLeadToolPolicy({ scoped, register, ctx, agent, config }) {
  const live = () => leadToolPolicy({
    mode: readConfig(config, 'leadToolMode'),
    deny: readConfig(config, 'leadToolDeny'),
  })
  const initial = live()
  if (initial.mode === 'off') return
  if (initial.mode === 'hide') {
    for (const name of initial.names) {
      try {
        // One name at a time: a tool this deployment does not mount, a scoped
        // tool, or the reserved transport name throws and is left to the guard.
        register(scoped.tools.restrict({ deny: [name] }))
      } catch {
        // Not a restrictable global tool here; the guard below still denies it.
      }
    }
  }
  register(scoped.tools.guard((exec) => {
    if (!teamPresetActive(agent, ctx)) return undefined
    const policy = live()
    if (policy.mode === 'off' || !policy.names.has(exec.name)) return undefined
    let teammates = []
    try {
      teammates = ctx.agentTeams.listMembers(agent)
        .filter((member) => member.role === 'teammate')
        .map((member) => member.name)
    } catch {
      teammates = []
    }
    return leadDelegateReason(exec.name, teammates)
  }))
  register(scoped.systemPrompt.section({
    name: 'agent-team-roles:lead-routing',
    order: scoped.systemPrompt.getSectionOrder('TEAM_POLICY') + 7,
    text: () => (live().mode === 'off' ? '' : leadRoutingGuide()),
  }))
}

/**
 * Install the Team Lead surface.
 *
 * The caller runs this only when the Agent's effective preset is
 * {@link TEAM_LEAD_PRESET}. Nothing here is safe in another preset: the Lead
 * rules bucket, memory guide and Lead memory tools are Team Lead-only, and a
 * plain session keeps its project memory tools without them.
 */
function installLead({ scoped, register, tools, ctx, config, snapshots, roles, ruleStore, agent, playbook, gateSummary, turnOf, routeDecisions }) {
  // Lead memory: standing rules about how the Lead itself works ("from now on,
  // ask before deleting"). Rendered per step so a new rule reaches the next
  // assembly. The stored rules stay in the profile; only their injection into a
  // non-Team-Lead session is dropped.
  if (ruleStore !== undefined) {
    register(scoped.systemPrompt.section({
      name: 'agent-team-roles:lead-rules',
      order: scoped.systemPrompt.getSectionOrder('TEAM_POLICY') + 9,
      text: () => {
        try {
          return ruleStore.render(LEAD_ROLE_ID, agent.id)
        } catch {
          return ''
        }
      },
    }))
  }
  for (const definition of tools.lead) {
    if (LEAD_MEMORY_TOOLS.includes(definition.name)) register(scoped.tools.register(definition))
  }

  // Where "remember this" belongs: global rules vs the workspace memory vault.
  // Team Lead-only, because a plain session has no role rules to maintain.
  register(scoped.systemPrompt.section({
    name: 'agent-team-roles:lead-memory',
    order: scoped.systemPrompt.getSectionOrder('TEAM_POLICY') + 8,
    text: () => leadMemoryGuide(),
  }))

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
  for (const definition of tools.lead) {
    if (!LEAD_MEMORY_TOOLS.includes(definition.name)) register(scoped.tools.register(definition))
  }
  installLeadToolPolicy({ scoped, register, ctx, agent, config })
  installLeadWorkflow({ scoped, register, agent, config, turnOf, ctx })
  installLeadRouter({ scoped, register, agent, config, routeDecisions, turnOf, ctx })
  register(scoped.tools.guard((exec) => {
    if (exec.name !== 'spawn_teammate') return undefined
    if (!teamPresetActive(agent, ctx)) return undefined
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

/** Pick the route a member must run with: switch override, live role, or snapshot. */
export function effectiveMemberRoute({ override, liveRole, frozen }) {
  if (override !== undefined) return override
  return liveRole ?? frozen
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

  // A Lead-requested route override (for example a manual or fallback switch)
  // wins over the role route. Otherwise the live role decides, so a Settings
  // change reaches an existing member on its next activation; the frozen
  // snapshot is only the fallback when the role itself is gone.
  const override = memberRouteOverrides?.get(handleKey)
  const route = effectiveMemberRoute({ override, liveRole: findRole(mergeRoles(roles.read()), roleId), frozen })
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
  // The guards read the root's live preset too: a role surface installed for a
  // Team must stop enforcing role policy the moment the root leaves team-lead,
  // even before the reconcile removes it.
  register(scoped.tools.guard((exec) => (
    teamPresetActive(membership.root, ctx) ? evaluateDeny(liveRoleOf(), exec.name, exec.arguments) : undefined
  )))
  // Preset tools can register after agent/created. A visibility mask computed
  // here would permanently hide later-registered tools, so visibility is left
  // to the preset and the per-call guard enforces the role allow-list.
  register(scoped.tools.guard((exec) => {
    if (!teamPresetActive(membership.root, ctx)) return undefined
    const liveRole = liveRoleOf()
    if (liveRole.toolMode !== 'custom') return undefined
    if (nativeMemberAllowList(roleId, liveRole.tools).has(exec.name)) return undefined
    return `Tool "${exec.name}" is not allowed by role "${roleId}".`
  }))

  for (const definition of tools.member) register(scoped.tools.register(definition))
  register(scoped.tools.guard((exec) => {
    if (exec.name !== 'spawn_teammate') return undefined
    if (!teamPresetActive(membership.root, ctx)) return undefined
    return 'Only the Team Lead can create teammates, and this Team uses spawn_team_member with a configured role.'
  }))

  try {
    const disposeSkills = installRoleSkills(agent, liveRoleOf(), () => teamPresetActive(membership.root, ctx))
    if (disposeSkills !== undefined && memberSkills !== undefined) {
      memberSkills.set(handleKey, disposeSkills)
      register(() => {
        // A settings refresh can replace the original private-skill install.
        const current = memberSkills.get(handleKey)
        memberSkills.delete(handleKey)
        current?.()
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
function installCodexMember({ membership, scoped, register, tools, snapshots, roles, ctx }) {
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
    if (!teamPresetActive(membership.root, ctx)) return undefined
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
