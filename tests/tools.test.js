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

test('member tools include self-learning and role creation', () => {
  assert.deepEqual(build().member.map((tool) => tool.name).sort(), [
    'create_team_role',
    'list_my_rules',
    'list_team_roles',
    'remember_role_rule',
  ])
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
  assert.equal((await list.execute({}, {})).roles[0].id, 'general')

  const create = tools.lead.find((tool) => tool.name === 'create_team_role')
  const created = await create.execute({ id: 'reviewer', name: 'Reviewer' }, {})
  assert.equal(created.role.id, 'reviewer')
  assert.equal(created.role.name, 'Reviewer')
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

test('argument validation rejects unknown fields and wrong enums', async () => {
  const tool = build().lead.find((candidate) => candidate.name === 'record_role_feedback')
  await assert.rejects(() => tool.execute({ role: 'general', text: 'x', scope: 'forever' }, {}), /one of/)
  await assert.rejects(() => tool.execute({ role: 'general', text: 'x', extra: true }, {}), /unknown argument/)
})
