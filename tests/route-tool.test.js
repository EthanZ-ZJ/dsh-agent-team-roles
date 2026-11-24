import test from 'node:test'
import assert from 'node:assert/strict'
import { createTools } from '../src/tools.js'
import { installLeadRouter } from '../src/plugin.js'
import { GENERAL_ROLE } from '../src/config.js'

function buildTools({ router } = {}) {
  return createTools({
    ctx: {
      agentTeams: {
        listMembers: () => [
          { name: 'lead', role: 'lead' },
          { name: 'dev', role: 'teammate' },
          { name: 'cr', role: 'teammate' },
        ],
      },
    },
    config: {},
    snapshots: {},
    rules: { list: () => [], add: async () => {}, forget: async () => false },
    roles: { read: () => [GENERAL_ROLE, { id: 'dev', name: 'DEV', description: 'implements', tools: ['read', 'write'] }] },
    router,
  })
}

function routeTool(router) {
  return buildTools({ router }).lead.find((tool) => tool.name === 'route_task')
}

const DECISION = {
  roleId: 'dev',
  confidence: 0.8,
  reason: 'frontend work',
  suggestedTaskPrompt: 'Fix the login page',
  needsSplit: [],
  source: 'rules',
  latencyMs: 2,
}

test('route_task is a Lead tool with the documented schema and description', () => {
  const tool = routeTool(undefined)
  assert.ok(tool, 'route_task must be in tools.lead')
  assert.match(tool.description, /before dispatching/i)
  assert.match(tool.description, /do not choose a role yourself/i)
  assert.deepEqual(tool.parameters.required, ['task'])
  assert.equal(tool.parameters.properties.task.type, 'string')
  assert.equal(tool.parameters.properties.context.type, 'string')
  assert.equal(tool.parameters.additionalProperties, false)
  assert.equal(tool.output.schema.type, 'object')
  const properties = tool.output.schema.properties
  for (const field of ['roleId', 'confidence', 'reason', 'suggestedTaskPrompt', 'needsSplit', 'source', 'latencyMs']) {
    assert.ok(properties[field], `output schema must declare ${field}`)
  }
  assert.equal(properties.model.type, 'string')
  assert.equal(tool.output.schema.required.includes('roleId'), true)
})

test('route_task calls the injected router, forwards members, and marks the decision', async () => {
  const requests = []
  const marked = []
  const tool = routeTool({
    policy: () => ({ mode: 'rules' }),
    route: async (request) => {
      requests.push(request)
      return DECISION
    },
    markDecision: (agent) => marked.push(agent),
  })
  const agent = { id: 'lead-1' }
  const result = await tool.execute({ task: 'Fix the login page', context: 'CSS bug' }, { agent })
  assert.deepEqual(result, DECISION)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].task, 'Fix the login page')
  assert.equal(requests[0].context, 'CSS bug')
  assert.deepEqual(requests[0].members, ['dev', 'cr'])
  assert.deepEqual(requests[0].roles.map((role) => role.id), ['general', 'dev'])
  assert.deepEqual(requests[0].policy, { mode: 'rules' })
  assert.equal(marked.length, 1)
  assert.equal(marked[0], agent)
})

test('route_task validates its arguments and the router dependency', async () => {
  const tool = routeTool({
    policy: () => ({ mode: 'rules' }),
    route: async () => DECISION,
  })
  await assert.rejects(() => tool.execute({}, { agent: { id: 'lead-1' } }), /argument "task" is required/)
  await assert.rejects(() => tool.execute({ task: '   ' }, { agent: { id: 'lead-1' } }), /task is required/)
  await assert.rejects(() => tool.execute({ task: 'x', unexpected: true }, { agent: { id: 'lead-1' } }), /unknown argument/)
  await assert.rejects(
    () => tool.execute({ task: 'x'.repeat(2001) }, { agent: { id: 'lead-1' } }),
    /at most 2000/,
  )
  await assert.rejects(
    () => tool.execute({ task: 'x', context: 'y'.repeat(2001) }, { agent: { id: 'lead-1' } }),
    /at most 2000/,
  )
  await assert.rejects(() => tool.execute({ task: 'x' }, {}), /calling Agent/)
  await assert.rejects(() => routeTool(undefined).execute({ task: 'x' }, { agent: { id: 'lead-1' } }), /routing is unavailable/)
})

function createScope() {
  const guards = []
  const sections = []
  const scoped = {
    tools: {
      guard(fn) {
        guards.push(fn)
        return () => {}
      },
    },
    systemPrompt: {
      getSectionOrder: () => 100,
      section(definition) {
        sections.push(definition)
        return () => {}
      },
    },
  }
  return { scoped, guards, sections }
}

test('the routing guard requires a per-turn route decision before spawning', () => {
  const { scoped, guards, sections } = createScope()
  const config = { routerRequireDecision: true }
  const routeDecisions = new Set()
  let turn = 7
  installLeadRouter({
    scoped,
    register: () => {},
    agent: { id: 'lead-1' },
    config,
    routeDecisions,
    turnOf: () => turn,
  })
  assert.match(sections[0].text(), /route_task/)
  assert.match(sections[0].text(), /do not choose a role yourself/i)
  const guard = guards[0]
  assert.match(guard({ name: 'spawn_team_member', arguments: {} }), /Call route_task before spawn_team_member/)
  assert.equal(guard({ name: 'send_message', arguments: {} }), undefined, 'other dispatch tools are not blocked')
  routeDecisions.add('lead-1:7')
  assert.equal(guard({ name: 'spawn_team_member', arguments: {} }), undefined, 'a routed turn is allowed')
  turn = 8
  assert.match(
    guard({ name: 'spawn_team_member', arguments: {} }),
    /Call route_task/,
    'the decision is scoped to the current turn',
  )
})

test('the routing guard can be switched off and a stale turn is refused', () => {
  const { scoped, guards } = createScope()
  const config = { routerRequireDecision: true }
  const routeDecisions = new Set(['lead-1:3'])
  installLeadRouter({
    scoped,
    register: () => {},
    agent: { id: 'lead-1' },
    config,
    routeDecisions,
    turnOf: () => 4,
  })
  const guard = guards[0]
  assert.match(guard({ name: 'spawn_team_member', arguments: {} }), /Call route_task/, 'a decision from turn 3 does not cover turn 4')
  config.routerRequireDecision = false
  assert.equal(guard({ name: 'spawn_team_member', arguments: {} }), undefined, 'requireDecision=false never blocks')

  const missing = createScope()
  installLeadRouter({
    scoped: missing.scoped,
    register: () => {},
    agent: { id: 'lead-1' },
    config: { routerRequireDecision: true },
    routeDecisions: undefined,
    turnOf: () => 1,
  })
  assert.match(missing.guards[0]({ name: 'spawn_team_member', arguments: {} }), /Call route_task/)
})
