import test from 'node:test'
import assert from 'node:assert/strict'
import { createTools } from '../src/tools.js'
import { GENERAL_ROLE } from '../src/config.js'

function build() {
  return createTools({
    ctx: {},
    config: {},
    snapshots: {},
    rules: {
      list: () => [],
      add: async () => {
        throw new Error('not used')
      },
      forget: async () => false,
    },
    roles: { read: () => [GENERAL_ROLE] },
  })
}

test('the Lead tool set uses standard JSON Schema for arguments and output', () => {
  const tools = build()
  assert.deepEqual(tools.lead.map((tool) => tool.name).sort(), [
    'create_team_role',
    'delete_team_role',
    'forget_role_rule',
    'list_role_rules',
    'list_team_roles',
    'record_role_feedback',
    'spawn_team_member',
    'switch_member_model',
    'update_team_role',
  ])
  for (const tool of tools.lead) {
    assert.equal(tool.parameters.type, 'object')
    assert.equal(
      tool.parameters.required === undefined || Array.isArray(tool.parameters.required),
      true,
    )
    assert.equal(tool.parameters.properties?.role?.required, undefined)
    assert.equal(tool.output.schema.type, 'object')
    assert.equal(
      tool.output.schema.required === undefined || Array.isArray(tool.output.schema.required),
      true,
    )
    assert.equal(typeof tool.output.render, 'function')
  }
})

test('member tools include self-learning, role creation, and gate reporting', () => {
  assert.deepEqual(build().member.map((tool) => tool.name).sort(), [
    'create_team_role',
    'list_my_rules',
    'list_team_roles',
    'remember_role_rule',
    'report_gate_event',
  ])
})

test('report_gate_event validates the event name and records into the ledger', async () => {
  const recorded = []
  const ledger = { record: (...args) => recorded.push(args) }
  const tools = createTools({
    ctx: {
      agentTeams: {
        tryMembership: () => ({ role: 'teammate', name: 'general', root: { id: 'team-1' } }),
      },
    },
    config: {},
    snapshots: { get: () => undefined },
    rules: {},
    roles: { read: () => [GENERAL_ROLE] },
    ledger,
  })
  const tool = tools.member.find((candidate) => candidate.name === 'report_gate_event')
  const result = await tool.execute(
    { event: 'review-approved', note: 'looks good' },
    { agent: { id: 'child-1' } },
  )
  assert.deepEqual(result, { recorded: true, event: 'review-approved', role: 'general' })
  assert.equal(recorded.length, 1)
  assert.equal(recorded[0][0], 'team-1')
  assert.equal(recorded[0][1], 'review-approved')
  assert.equal(recorded[0][2], 'general')
  assert.equal(recorded[0][4], 'looks good')
  await assert.rejects(
    () => tool.execute({ event: 'Bad Event' }, { agent: { id: 'child-1' } }),
    /kebab-case/,
  )
})

test('list_role_rules returns rule views through the registered execute', async () => {
  const tools = createTools({
    ctx: {},
    config: {},
    snapshots: {},
    rules: {
      list: () => [{
        id: 'rule-1',
        roleId: 'general',
        text: 'Prefer pnpm',
        polarity: 'preference',
        status: 'active',
        evidence: 2,
        source: 'lead',
        createdAt: 1,
        updatedAt: 2,
      }],
      add: async () => {
        throw new Error('not used')
      },
      forget: async () => false,
    },
    roles: { read: () => [GENERAL_ROLE] },
  })
  const tool = tools.lead.find((candidate) => candidate.name === 'list_role_rules')
  const result = await tool.execute({ role: 'general' }, {})
  assert.deepEqual(result, {
    rules: [{
      id: 'rule-1',
      roleId: 'general',
      text: 'Prefer pnpm',
      polarity: 'preference',
      status: 'active',
      evidence: 2,
      source: 'lead',
    }],
  })
})

test('role tools delegate to the agentTeamRoles service', async () => {
  const api = {
    list: () => [GENERAL_ROLE],
    create: async (role) => ({ ...GENERAL_ROLE, ...role }),
    update: async (id, patch) => ({ ...GENERAL_ROLE, id, ...patch }),
    remove: async () => undefined,
  }
  const tools = createTools({
    ctx: { get: (name) => (name === 'agentTeamRoles' ? api : undefined) },
    config: {},
    snapshots: {},
    rules: {},
    roles: { read: () => [GENERAL_ROLE] },
  })
  const list = tools.lead.find((tool) => tool.name === 'list_team_roles')
  const listed = (await list.execute({}, {})).roles[0]
  assert.equal(listed.id, 'general')
  assert.equal(listed.fallbackReasoningEffort, '')

  const create = tools.lead.find((tool) => tool.name === 'create_team_role')
  const created = await create.execute({ id: 'reviewer', name: 'Reviewer', reasoningEffort: 'high', fallbackReasoningEffort: 'low' }, {})
  assert.equal(created.role.id, 'reviewer')
  assert.equal(created.role.name, 'Reviewer')
  assert.equal(created.role.reasoningEffort, 'high')
  assert.equal(created.role.fallbackReasoningEffort, 'low')
  const update = tools.lead.find((tool) => tool.name === 'update_team_role')
  assert.equal(update.parameters.properties.fallbackReasoningEffort.type, 'string')
  assert.equal((await update.execute({ id: 'reviewer', fallbackReasoningEffort: 'medium' }, {})).role.fallbackReasoningEffort, 'medium')
})

test('the role service must be available for role tools', async () => {
  const tools = createTools({
    ctx: { get: () => undefined },
    config: {},
    snapshots: {},
    rules: {},
    roles: { read: () => [GENERAL_ROLE] },
  })
  const list = tools.lead.find((tool) => tool.name === 'list_team_roles')
  await assert.rejects(() => list.execute({}, {}), /service is unavailable/)
})

test('record_role_feedback validates the role and records a permanent rule', async () => {
  const added = []
  const tools = createTools({
    ctx: {},
    config: {},
    snapshots: {},
    rules: {
      list: () => [],
      add: async (input) => {
        added.push(input)
        return {
          rule: {
            id: 'rule-1',
            roleId: input.roleId,
            text: input.text,
            polarity: input.polarity,
            status: 'active',
            evidence: 2,
            source: 'lead',
          },
          promoted: true,
          scope: input.scope,
        }
      },
      forget: async () => false,
    },
    roles: { read: () => [GENERAL_ROLE] },
  })
  const tool = tools.lead.find((candidate) => candidate.name === 'record_role_feedback')
  const result = await tool.execute(
    { role: 'general', text: 'Brand name is 尚卫干洗店', scope: 'permanent' },
    { agent: { id: 'lead-session' } },
  )
  assert.equal(added[0].roleId, 'general')
  assert.equal(added[0].rootSessionId, 'lead-session')
  assert.equal(result.promoted, true)
  assert.equal(result.rule.text, 'Brand name is 尚卫干洗店')
  await assert.rejects(
    () => tool.execute({ role: 'missing', text: 'x' }, { agent: { id: 'lead-session' } }),
    /unknown role/,
  )
})

test('argument validation rejects unknown fields and wrong enums', async () => {
  const tool = build().lead.find((candidate) => candidate.name === 'record_role_feedback')
  await assert.rejects(() => tool.execute({ role: 'general', text: 'x', scope: 'forever' }, {}), /one of/)
  await assert.rejects(() => tool.execute({ role: 'general', text: 'x', extra: true }, {}), /unknown argument/)
})

test('switch_member_model re-selects the fallback route in place and sends a continue message', async () => {
  const selected = []
  const sent = []
  const tools = createTools({
    ctx: {
      agentTeams: {
        tryMembership: () => ({ role: 'lead', root: { id: 'root-1' }, name: 'lead' }),
        listMembers: () => [{ role: 'teammate', name: 'dev', status: 'active' }],
        sendMessage: async (caller, payload) => { sent.push(payload) },
      },
    },
    config: {},
    snapshots: { get: () => ({ roleId: 'dev' }) },
    rules: { list: () => [], add: async () => { throw new Error('not used') }, forget: async () => false },
    roles: {
      read: () => [{ ...GENERAL_ROLE, id: 'dev', name: 'DEV', provider: 'p1', model: 'm1', reasoningEffort: 'high', fallbackProvider: 'p2', fallbackModel: 'm2', fallbackReasoningEffort: 'low' }],
    },
    memberAgents: new Map([['root-1:dev', { model: { select: (route) => selected.push(route) } }]]),
  })
  const tool = tools.lead.find((candidate) => candidate.name === 'switch_member_model')
  const result = await tool.execute({ member: 'dev', route: 'fallback' }, { agent: { id: 'root-1' } })
  assert.deepEqual(result, { member: 'dev', route: 'fallback', provider: 'p2', model: 'm2', messageSent: true, applied: 'live' })
  assert.equal(selected.length, 1)
  assert.deepEqual(selected[0], { provider: 'p2', model: 'm2', reasoningEffort: 'low' })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].target, 'dev')
  await tool.execute({ member: 'dev', route: 'primary' }, { agent: { id: 'root-1' } })
  assert.deepEqual(selected[1], { provider: 'p1', model: 'm1', reasoningEffort: 'high' })
})

test('switch_member_model works on a dormant member through the route override', async () => {
  const sent = []
  const overrides = new Map()
  const tools = createTools({
    ctx: {
      agentTeams: {
        tryMembership: () => ({ role: 'lead', root: { id: 'root-1' }, name: 'lead' }),
        listMembers: () => [{ role: 'teammate', name: 'dev', status: 'inactive' }],
        sendMessage: async (caller, payload) => { sent.push(payload) },
      },
    },
    config: {},
    snapshots: { get: () => ({ roleId: 'dev' }) },
    rules: { list: () => [], add: async () => { throw new Error('not used') }, forget: async () => false },
    roles: {
      read: () => [{ ...GENERAL_ROLE, id: 'dev', name: 'DEV', provider: 'p1', model: 'm1', reasoningEffort: 'high', fallbackProvider: 'p2', fallbackModel: 'm2', fallbackReasoningEffort: '' }],
    },
    memberAgents: new Map(),
    memberRouteOverrides: overrides,
  })
  const tool = tools.lead.find((candidate) => candidate.name === 'switch_member_model')
  const result = await tool.execute({ member: 'dev', route: 'fallback' }, { agent: { id: 'root-1' } })
  assert.equal(result.applied, 'pending-activation')
  assert.equal(result.provider, 'p2')
  assert.deepEqual(
    { ...overrides.get('root-1:dev'), at: 0 },
    { provider: 'p2', model: 'm2', route: 'fallback', via: 'lead', at: 0 },
  )
  assert.equal(sent.length, 1)
})

test('switch_member_model refuses a role without a configured fallback', async () => {
  const tools = createTools({
    ctx: {
      agentTeams: {
        tryMembership: () => ({ role: 'lead', root: { id: 'root-1' }, name: 'lead' }),
        listMembers: () => [{ role: 'teammate', name: 'general', status: 'active' }],
        sendMessage: async () => { throw new Error('not used') },
      },
    },
    config: {},
    snapshots: { get: () => ({ roleId: 'general' }) },
    rules: { list: () => [], add: async () => { throw new Error('not used') }, forget: async () => false },
    roles: { read: () => [GENERAL_ROLE] },
    memberAgents: new Map(),
  })
  const tool = tools.lead.find((candidate) => candidate.name === 'switch_member_model')
  await assert.rejects(
    () => tool.execute({ member: 'general', route: 'fallback' }, { agent: { id: 'root-1' } }),
    /no fallback model configured/,
  )
})
