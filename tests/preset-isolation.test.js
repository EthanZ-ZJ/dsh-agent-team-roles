/**
 * Team Lead preset isolation.
 *
 * User requirement: everything this plugin adds for the Team Lead — role
 * catalog, routing/workflow/router prompts, Lead rules, Lead memory guide and
 * tools — must exist only in a `team-lead` preset session. A teammate is
 * role-configured only when its official team root runs `team-lead`; an
 * unresolved preset installs nothing (fail closed). A blank session may switch
 * preset before its first turn, so every install must be reversible.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, effectiveAgentPreset, isTeamLeadPreset, TEAM_LEAD_PRESET } from '../src/plugin.js'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'team-roles-preset-'))
const skillDir = join(process.env.DSH_HOME, 'agent-team-roles', 'skills', 'dev')
mkdirSync(skillDir, { recursive: true })
writeFileSync(join(skillDir, 'dev-private.md'), '---\nname: dev-private\ndescription: A private development skill\n---\nPrivate DEV workflow.')

const CONFIG = {
  roles: [
    {
      id: 'general',
      name: 'General',
      description: 'General-purpose teammate',
      persona: 'GENERAL PERSONA',
      provider: '',
      model: '',
      fallbacks: [],
      toolMode: 'all',
      tools: [],
      skills: [],
      denyCommands: [],
      color: '',
    },
    {
      id: 'dev',
      name: 'DEV',
      description: 'Implementation',
      persona: 'DEV PERSONA',
      provider: '',
      model: '',
      fallbacks: [],
      toolMode: 'all',
      tools: [],
      skills: [],
      denyCommands: ['\\bgit\\s+push\\b'],
      color: '',
    },
  ],
  rules: [
    {
      id: 'rule-lead-1',
      roleId: 'lead',
      text: 'Always answer briefly.',
      polarity: 'preference',
      status: 'active',
      evidence: 1,
      source: 'lead',
      createdAt: 1,
      updatedAt: 1,
    },
  ],
}

const LEAD_SECTIONS = [
  'agent-team-roles:active-members',
  'agent-team-roles:lead-catalog',
  'agent-team-roles:lead-gates',
  'agent-team-roles:lead-memory',
  'agent-team-roles:lead-router',
  'agent-team-roles:lead-routing',
  'agent-team-roles:lead-rules',
  'agent-team-roles:lead-workflow',
]

const LEAD_TOOLS = [
  'create_team_role',
  'delete_team_role',
  'forget_role_rule',
  'list_role_rules',
  'list_team_roles',
  'record_role_feedback',
  'route_task',
  'spawn_team_member',
  'switch_member_model',
  'update_team_role',
]

const MEMBER_TOOLS = ['create_team_role', 'list_my_rules', 'list_team_roles', 'remember_role_rule', 'report_gate_event']

/** One recording Agent scope with the service shapes the plugin calls. */
function makeScope(toolsChanged) {
  const sections = []
  const registered = []
  const admitted = new Map()
  const guards = []
  const commands = new Map()
  const skills = new Map()
  const injections = new Set()
  const remove = (list, entry) => {
    const index = list.indexOf(entry)
    if (index >= 0) list.splice(index, 1)
  }
  return {
    sections,
    registered,
    admitted,
    guards,
    commands,
    skills,
    injections,
    inject: ([service], install) => {
      const entries = service === 'commands' ? commands : skills
      const disposers = []
      let disposed = false
      const fiber = {
        async dispose() {
          if (disposed) return
          disposed = true
          injections.delete(fiber)
          // Cordis begins teardown now but invokes child effects later.
          await Promise.resolve()
          for (const dispose of disposers) dispose()
        },
      }
      injections.add(fiber)
      const start = Promise.resolve().then(() => {
        if (!disposed) install({ [service]: {
          register: (definition) => {
            assert.equal(entries.has(definition.name), false, 'no duplicate scoped registration')
            entries.set(definition.name, definition)
            let registered = true
            const dispose = () => {
              if (!registered) return
              registered = false
              entries.delete(definition.name)
            }
            disposers.push(dispose)
            return dispose
          },
        } })
        return fiber
      })
      return { dispose: fiber.dispose, then: start.then.bind(start) }
    },
    systemPrompt: {
      getSectionOrder: () => 0,
      section: (definition) => {
        sections.push(definition)
        return () => remove(sections, definition)
      },
    },
    tools: {
      register: (definition, options) => {
        assert.equal(admitted.has(definition.name), false, 'no duplicate tool registration')
        registered.push(definition.name)
        admitted.set(definition.name, options?.when)
        toolsChanged()
        return () => {
          remove(registered, definition.name)
          admitted.delete(definition.name)
          toolsChanged()
        }
      },
      guard: (predicate) => {
        guards.push(predicate)
        return () => remove(guards, predicate)
      },
    },
    effect: (install) => {
      const dispose = install()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
}

/** A fake Host context good enough for plugin activation and reconciliation. */
function createHarness() {
  const agents = []
  const composed = new Map()
  const recorded = new Map()
  const memberships = new Map()
  const handlers = new Map()
  const commands = new Map()
  const warnings = []
  const notify = (event, ...args) => {
    for (const listener of handlers.get(event) ?? []) listener(...args)
  }

  const presets = {
    composedPreset: (agentCtx) => composed.get(agentCtx),
    presetForSession: (session) => (recorded.has(session) ? recorded.get(session) : null),
  }

  const agentTeams = {
    tryMembership: (agent) => memberships.get(agent),
    listMembers: (agent) => {
      const rows = [{ id: agent.id, name: 'lead', role: 'lead', status: 'idle', diagnostics: [] }]
      for (const [candidate, membership] of memberships) {
        if (candidate !== agent && membership.role === 'teammate' && membership.root === agent) {
          rows.push({ id: candidate.id, name: membership.name, role: 'teammate', status: 'idle', diagnostics: [] })
        }
      }
      return rows
    },
  }

  const ctx = {
    get: (name) => (name === 'agentPresets' ? presets : undefined),
    fiber: { entry: undefined },
    agents: { list: () => [...agents] },
    agentTeams,
    on: (event, listener) => {
      const listeners = handlers.get(event) ?? []
      listeners.push(listener)
      handlers.set(event, listeners)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    effect: (install) => {
      const dispose = install()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    provide: () => {},
    inject: () => {},
    logger: {
      warn: (message) => warnings.push(String(message)),
      info: () => {},
      error: () => {},
    },
    commands: {
      register: (definition) => {
        commands.set(definition.name, definition)
        return () => commands.delete(definition.name)
      },
    },
  }

  return { ctx, agents, composed, recorded, memberships, handlers, commands, warnings, notify }
}

function addAgent(harness, { id, headerPreset, composedPreset, scope = makeScope(() => harness.notify('tools/change')) }) {
  const agent = {
    id,
    status: 'idle',
    session: {
      header: headerPreset === undefined ? {} : { agentPreset: headerPreset },
      snapshotEvents: () => [],
    },
    ctx: scope,
    model: { select: () => {} },
  }
  harness.agents.push(agent)
  if (composedPreset !== undefined) harness.composed.set(scope, composedPreset)
  return agent
}

function addLead(harness, options) {
  const agent = addAgent(harness, options)
  harness.memberships.set(agent, { root: agent, id: agent.id, role: 'lead', name: 'lead' })
  return agent
}

function addTeammate(harness, root, options) {
  const agent = addAgent(harness, options)
  harness.memberships.set(agent, { root, id: root.id, role: 'teammate', name: options.name ?? 'dev' })
  return agent
}

/** Let the plugin settle (the snapshot store opens asynchronously). */
async function settle(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function activate(harness) {
  apply(harness.ctx, CONFIG)
  return harness
}

async function emit(harness, event, ...args) {
  for (const listener of harness.handlers.get(event) ?? []) await listener(...args)
  await settle()
}

async function preStep(harness, agent, messages = []) {
  const [listener] = harness.handlers.get('agent/pre-step') ?? []
  return listener({ agent, messages, turn: 1, step: 1 }, async () => ({ kind: 'enter', messages }))
}

test('the live composition wins over a stale session header', () => {
  const ctx = {
    get: (name) => (name === 'agentPresets'
      ? { composedPreset: () => 'standard', presetForSession: () => 'team-lead' }
      : undefined),
  }
  const agent = { session: { header: { agentPreset: 'team-lead' } }, ctx: {} }
  assert.equal(effectiveAgentPreset(agent, ctx), 'standard')
  assert.equal(isTeamLeadPreset(agent, ctx), false)
  assert.equal(TEAM_LEAD_PRESET, 'team-lead')
})

test('the durable selection and the header are fallbacks when no composition is reported', () => {
  const recordedOnly = {
    get: (name) => (name === 'agentPresets'
      ? { composedPreset: () => undefined, presetForSession: () => 'team-lead' }
      : undefined),
  }
  assert.equal(effectiveAgentPreset({ session: { header: {} }, ctx: {} }, recordedOnly), 'team-lead')
  assert.equal(
    effectiveAgentPreset({ session: { header: { agentPreset: 'standard' } }, ctx: {} }, { get: () => undefined }),
    'standard',
  )
  assert.equal(effectiveAgentPreset({ session: { header: {} }, ctx: {} }, { get: () => undefined }), undefined)
})

test('a plain-preset Lead gets no Team Lead prompt, tool, or guard surface', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root-plain', headerPreset: 'standard', composedPreset: 'standard' })
  activate(harness)
  await settle()

  assert.deepEqual(root.ctx.sections, [])
  assert.deepEqual(root.ctx.registered, [])
  assert.deepEqual(root.ctx.guards, [])
})

test('only the Team Lead overlay suppresses the synthetic READY settlement', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root', composedPreset: 'standard' })
  const messages = [{
    source: { kind: 'subagent-settled' },
    content: [{ type: 'text', text: 'Background subagent dev completed' }, { type: 'text', text: 'READY' }],
  }]
  activate(harness)
  assert.deepEqual((await preStep(harness, root, messages)).messages, messages)

  harness.composed.set(root.ctx, 'team-lead')
  harness.notify('tools/change')
  assert.deepEqual((await preStep(harness, root, messages)).messages, [])
})

test('a team-lead Lead gets the full Team Lead surface, including memory', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root-team', headerPreset: 'standard', composedPreset: 'team-lead' })
  activate(harness)
  await settle()

  assert.deepEqual(root.ctx.sections.map((section) => section.name).sort(), LEAD_SECTIONS)
  assert.deepEqual([...root.ctx.registered].sort(), LEAD_TOOLS)
  assert.ok(root.ctx.guards.length >= 3, 'tool policy, workflow, router, and official-spawn guards are installed')
  const memory = root.ctx.sections.find((section) => section.name === 'agent-team-roles:lead-memory')
  assert.match(memory.text(), /Remembering what the user tells you/)
  // Stored Lead rules are not removed: a team-lead session renders them again.
  const rules = root.ctx.sections.find((section) => section.name === 'agent-team-roles:lead-rules')
  assert.match(rules.text(), /Always answer briefly/)
  assert.deepEqual(CONFIG.rules.map((rule) => rule.id), ['rule-lead-1'], 'the stored rules stay untouched')
})

test('a teammate of a non-Team root gets no role persona or member tools', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root-plain', headerPreset: 'standard', composedPreset: 'standard' })
  const member = addTeammate(harness, root, {
    id: 'member-dev',
    headerPreset: 'standard',
    composedPreset: 'standard',
    name: 'dev',
  })
  activate(harness)
  await settle()

  assert.deepEqual(member.ctx.sections, [], 'DEV persona is not injected under a non-Team root')
  assert.deepEqual(member.ctx.registered, [], 'member-only tools are not registered under a non-Team root')
  assert.deepEqual(member.ctx.guards, [])
})

test('a teammate of a team-lead root gets its role persona and member tools', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root-team', headerPreset: 'standard', composedPreset: 'team-lead' })
  const member = addTeammate(harness, root, {
    id: 'member-dev',
    headerPreset: 'standard',
    composedPreset: 'standard',
    name: 'dev',
  })
  activate(harness)
  await settle()

  const persona = member.ctx.sections.find((section) => section.name === 'agent-team-roles:member-persona')
  assert.ok(persona, 'the member persona section is installed')
  assert.match(persona.text(), /You are teammate "dev": role "DEV"/)
  assert.match(persona.text(), /DEV PERSONA/)
  assert.deepEqual([...member.ctx.registered].sort(), MEMBER_TOOLS)
  assert.ok(member.ctx.guards.length >= 3)
})

test('an unresolved root preset defers the member install and retries at pre-step', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root-unresolved' })
  const member = addTeammate(harness, root, { id: 'member-dev', name: 'dev' })
  activate(harness)
  await settle()

  assert.deepEqual(root.ctx.sections, [], 'an unresolved preset gets nothing (fail closed)')
  assert.deepEqual(member.ctx.sections, [], 'a teammate of an unresolved root gets nothing')

  harness.composed.set(root.ctx, 'team-lead')
  await preStep(harness, root)
  await preStep(harness, member)
  assert.ok(root.ctx.sections.some((section) => section.name === 'agent-team-roles:lead-catalog'))
  assert.ok(member.ctx.sections.some((section) => section.name === 'agent-team-roles:member-persona'))
})

test('switching plain -> team -> plain installs and then removes the surface', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root-switch', headerPreset: 'standard', composedPreset: 'standard' })
  activate(harness)
  await settle()
  assert.deepEqual(root.ctx.sections, [])

  harness.composed.set(root.ctx, 'team-lead')
  await emit(harness, 'agent-preset/selected', root.id, 'team-lead')
  assert.ok(root.ctx.registered.includes('spawn_team_member'), 'team switch adds the Lead tools')
  assert.ok(root.ctx.registered.includes('record_role_feedback'), 'team switch adds the Lead memory tools')
  assert.ok(root.ctx.sections.some((section) => section.name === 'agent-team-roles:lead-catalog'))

  harness.composed.set(root.ctx, 'standard')
  await emit(harness, 'agent-preset/selected', root.id, 'standard')
  assert.deepEqual(root.ctx.sections, [], 'switching back removes every Lead prompt')
  assert.deepEqual(root.ctx.registered, [], 'switching back removes every Lead tool')
  assert.deepEqual(root.ctx.guards, [], 'switching back removes every Lead guard')
})

test('a root preset change also reconciles its live members', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root-team', headerPreset: 'standard', composedPreset: 'team-lead' })
  const member = addTeammate(harness, root, {
    id: 'member-dev',
    headerPreset: 'standard',
    composedPreset: 'standard',
    name: 'dev',
  })
  activate(harness)
  await settle()
  assert.ok(member.ctx.sections.some((section) => section.name === 'agent-team-roles:member-persona'))

  harness.composed.set(root.ctx, 'standard')
  await emit(harness, 'agent-preset/selected', root.id, 'standard')
  assert.deepEqual(member.ctx.sections, [], 'member role surface fails closed when the root leaves team-lead')
  assert.deepEqual(member.ctx.registered, [])
})

test('Team Lead commands are only discoverable in a Lead scope and reject stale calls', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root-team', headerPreset: 'team-lead', composedPreset: 'team-lead' })
  const plain = addLead(harness, { id: 'root-plain', headerPreset: 'team-lead', composedPreset: 'standard' })
  const member = addTeammate(harness, root, { id: 'member-dev', name: 'dev', composedPreset: 'standard' })
  activate(harness)
  await settle()

  assert.deepEqual([...harness.commands], [], 'no global slash commands are registered')
  assert.deepEqual([...plain.ctx.commands], [], 'the plain Lead cannot discover slash commands')
  assert.deepEqual([...member.ctx.commands], [], 'teammates cannot discover Lead slash commands')
  assert.deepEqual([...root.ctx.commands.keys()].sort(), ['team-gates', 'team-spawn', 'team-template'])
  const teamSpawn = root.ctx.commands.get('team-spawn')
  const allowed = await teamSpawn.handler({ agent: root, rawInput: '', signal: new AbortController().signal })
  assert.equal(allowed.kind, 'error')
  assert.match(allowed.text, /usage: \/team-spawn/, 'the boundary passes before the argument check')
  for (const name of ['team-template', 'team-gates']) {
    assert.notEqual((await root.ctx.commands.get(name).handler({ agent: root, rawInput: 'list' })).kind, 'error')
  }

  harness.composed.set(root.ctx, 'standard')
  for (const command of root.ctx.commands.values()) {
    const refused = await command.handler({ agent: root, rawInput: 'list', signal: new AbortController().signal })
    assert.equal(refused.kind, 'error')
    assert.match(refused.text, /Team Lead preset/)
  }
  harness.notify('tools/change')
  assert.deepEqual([...root.ctx.commands], [], 'recompose removes slash-command discovery')
})

test('direct recompose refreshes both root and member overlays synchronously without select or pre-step', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root', headerPreset: 'team-lead', composedPreset: 'team-lead' })
  const member = addTeammate(harness, root, { id: 'member-dev', name: 'dev', composedPreset: 'standard' })
  activate(harness)
  await settle()
  assert.ok(member.ctx.skills.has('dev-private'))

  // Matches installed agentPresets.recompose: bind, then emit tools/change.
  // The durable selection is not updated by this service call.
  harness.composed.set(root.ctx, 'standard')
  harness.notify('tools/change')
  for (const agent of [root, member]) {
    assert.deepEqual(agent.ctx.sections, [])
    assert.deepEqual(agent.ctx.registered, [])
    assert.deepEqual(agent.ctx.guards, [])
    assert.equal(agent.ctx.commands.size, 0)
    assert.equal(agent.ctx.skills.size, 0)
  }

  assert.equal(root.ctx.injections.size, 0, 'the owning command fiber was disposed')
  assert.equal(member.ctx.injections.size, 0, 'the owning skill fiber was disposed')

  harness.composed.set(root.ctx, 'team-lead')
  harness.notify('tools/change')
  assert.deepEqual([...root.ctx.registered].sort(), LEAD_TOOLS)
  assert.deepEqual([...member.ctx.registered].sort(), MEMBER_TOOLS)
  assert.equal(root.ctx.commands.size, 0, 'the new commands fiber has not started yet')
  await Promise.resolve()
  assert.ok(member.ctx.skills.has('dev-private'))
  assert.deepEqual([...root.ctx.commands.keys()].sort(), ['team-gates', 'team-spawn', 'team-template'])
  assert.deepEqual(harness.warnings, [])
})

test('a quick preset switch cancels pending command and private-skill injections', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root-quick', composedPreset: 'standard' })
  const member = addTeammate(harness, root, { id: 'member-quick', name: 'dev', composedPreset: 'standard' })
  activate(harness)
  await settle()

  const recompose = (preset) => {
    harness.composed.set(root.ctx, preset)
    harness.notify('tools/change')
  }
  recompose('team-lead')
  assert.equal(root.ctx.injections.size, 1)
  assert.equal(member.ctx.injections.size, 1)
  recompose('standard')
  await Promise.resolve()
  assert.equal(root.ctx.commands.size, 0)
  assert.equal(member.ctx.skills.size, 0)
  assert.equal(root.ctx.injections.size, 0)
  assert.equal(member.ctx.injections.size, 0)

  recompose('team-lead')
  // Also guard delayed activation if the binding changed before reconciliation.
  harness.composed.set(root.ctx, 'standard')
  await Promise.resolve()
  assert.equal(root.ctx.commands.size, 0)
  assert.equal(member.ctx.skills.size, 0)
  harness.notify('tools/change')

  recompose('team-lead')
  await Promise.resolve()
  assert.deepEqual([...root.ctx.commands.keys()].sort(), ['team-gates', 'team-spawn', 'team-template'])
  assert.deepEqual([...member.ctx.skills.keys()].sort(), ['clean-code-guard', 'dev-private', 'frontend-design', 'web-interface-guidelines'])
  assert.equal(root.ctx.skills.size, 0, 'the Team Lead has no role-private skill registrations')
  harness.notify('agent/disposed', { agent: root })
  harness.notify('agent/disposed', { agent: member })
  assert.equal(root.ctx.commands.size, 0)
  assert.equal(member.ctx.skills.size, 0)
  assert.equal(root.ctx.injections.size, 0)
  assert.equal(member.ctx.injections.size, 0)
  assert.deepEqual(harness.warnings, [])
})

test('a stale Lead install omits prompt text and tool schemas before the rebind notification', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root-stale', headerPreset: 'standard', composedPreset: 'team-lead' })
  activate(harness)
  await settle()
  const section = (name) => root.ctx.sections.find((candidate) => candidate.name === name)
  assert.match(section('agent-team-roles:lead-catalog').text(), /Role-based teammate spawning/)

  assert.equal(root.ctx.admitted.get('spawn_team_member')(), true)

  // Model admission between the binding update and tools/change notification.
  // No selected event or pre-step has fired either.
  harness.composed.set(root.ctx, 'standard')

  assert.equal(root.ctx.admitted.get('spawn_team_member')(), false, 'stale schemas cannot be admitted')
  assert.equal(root.ctx.admitted.get('record_role_feedback')(), false)
  assert.equal(section('agent-team-roles:lead-catalog').text(), '', 'the section text provider self-gates')
  assert.equal(section('agent-team-roles:lead-memory').text(), '')
  assert.equal(section('agent-team-roles:lead-rules').text(), '')
  assert.equal(section('agent-team-roles:active-members').text(), '')
  const boundary = root.ctx.guards.find((guard) => (
    /Team tools are available only/.test(guard({ name: 'spawn_team_member', arguments: {} }) ?? '')
  ))
  assert.ok(boundary, 'a stale Lead tool is refused until the reconcile removes it')

  // The backstop reconcile still removes the definitions completely.
  await preStep(harness, root)
  assert.deepEqual(root.ctx.sections, [])
  assert.deepEqual(root.ctx.registered, [])
})

test('a stale member role install hides its persona and stops role policy before reconcile', async () => {
  const harness = createHarness()
  const root = addLead(harness, { id: 'root-team', headerPreset: 'standard', composedPreset: 'team-lead' })
  const member = addTeammate(harness, root, {
    id: 'member-dev',
    headerPreset: 'standard',
    composedPreset: 'standard',
    name: 'dev',
  })
  activate(harness)
  await settle()
  const persona = member.ctx.sections.find((section) => section.name === 'agent-team-roles:member-persona')
  assert.match(persona.text(), /DEV PERSONA/)
  const denyReason = member.ctx.guards
    .map((guard) => guard({ name: 'pwsh', arguments: { command: 'git push origin main' } }))
    .find((reason) => typeof reason === 'string')
  assert.match(denyReason, /denyCommands/)

  // Root recomposed away without a selection event: no listener, no pre-step.
  harness.composed.set(root.ctx, 'standard')
  assert.equal(persona.text(), '', 'the member persona self-gates before assembly')
  const staleDeny = member.ctx.guards
    .map((guard) => guard({ name: 'pwsh', arguments: { command: 'git push origin main' } }))
    .find((reason) => typeof reason === 'string' && /denyCommands/.test(reason))
  assert.equal(staleDeny, undefined, 'role policy stops applying until the reconcile removes it')
  const boundary = member.ctx.guards.find((guard) => (
    /Team tools are available only/.test(guard({ name: 'create_team_role', arguments: {} }) ?? '')
  ))
  assert.ok(boundary, 'a stale member tool is refused until the reconcile removes it')

  await preStep(harness, member)
  assert.deepEqual(member.ctx.sections, [])
  assert.deepEqual(member.ctx.registered, [])
})
