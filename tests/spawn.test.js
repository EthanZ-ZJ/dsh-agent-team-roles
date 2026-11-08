import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnRoleMember } from '../src/spawn.js'
import { normalizeRole } from '../src/config.js'

const role = normalizeRole({
  id: 'se',
  name: 'SE',
  description: 'Solution engineer',
  persona: 'Analyze only.',
})

function build({ existing = ['se'], snapshotsByMember = {} } = {}) {
  const recorded = []
  const removed = []
  const spawned = []
  const sent = []
  const ctx = {
    get: () => undefined,
    agentTeams: {
      listMembers: () => existing.map((name) => ({ name, role: 'teammate', status: 'inactive' })),
      spawnTeammate: async (_caller, request) => {
        spawned.push(request)
        return { member: { name: request.name, status: 'running' } }
      },
      sendMessage: async (_caller, request) => {
        sent.push(request)
        return { messageId: `msg-${sent.length}` }
      },
    },
  }
  const snapshots = {
    get: (_root, name) => snapshotsByMember[name],
    record: async (record) => { recorded.push(record) },
    remove: async (rootSessionId, name) => { removed.push([rootSessionId, name]) },
  }
  return { ctx, snapshots, recorded, removed, spawned, sent }
}

test('an existing member of the same role is reused and receives the task', async () => {
  const harness = build({ existing: ['se'] })
  const member = await spawnRoleMember({
    ctx: harness.ctx,
    config: { freshProvider: 'spawn' },
    snapshots: harness.snapshots,
    roles: [role],
    caller: { id: 'lead-session' },
    roleId: 'se',
    prompt: 'Analyze the repository.',
    signal: undefined,
  })
  assert.equal(member.target, 'se')
  assert.equal(member.role, 'se')
  assert.equal(member.reused, true)
  assert.equal(member.taskSent, true)
  assert.equal(harness.spawned.length, 0)
  assert.equal(harness.sent.length, 1)
  assert.equal(harness.sent[0].target, 'se')
  assert.deepEqual(harness.recorded, [])
  assert.deepEqual(harness.removed, [])
})

test('an existing member is reused for a handshake without sending a task', async () => {
  const harness = build({ existing: ['se'] })
  const member = await spawnRoleMember({
    ctx: harness.ctx,
    config: {},
    snapshots: harness.snapshots,
    roles: [role],
    caller: { id: 'lead-session' },
    roleId: 'se',
    prompt: '[[TEAM_HANDSHAKE]] reply READY',
    signal: undefined,
  })
  assert.equal(member.target, 'se')
  assert.equal(member.reused, true)
  assert.equal(member.taskSent, false)
  assert.equal(harness.sent.length, 0)
  assert.equal(harness.spawned.length, 0)
})

test('a taken name in a different role still gets a suffix', async () => {
  const harness = build({
    existing: ['se'],
    snapshotsByMember: { se: { roleId: 'other' } },
  })
  const member = await spawnRoleMember({
    ctx: harness.ctx,
    config: { freshProvider: 'spawn' },
    snapshots: harness.snapshots,
    roles: [role],
    caller: { id: 'lead-session' },
    roleId: 'se',
    prompt: 'Analyze the repository.',
    signal: undefined,
  })
  assert.equal(member.target, 'se-2')
  assert.equal(member.reused, false)
  assert.equal(harness.spawned.length, 1)
  assert.equal(harness.recorded[0].name, 'se-2')
})

test('a failed spawn removes the recorded snapshot', async () => {
  const recorded = []
  const removed = []
  const ctx = {
    get: () => undefined,
    agentTeams: {
      listMembers: () => [],
      spawnTeammate: async () => { throw new Error('backend failed') },
      sendMessage: async () => { throw new Error('not used') },
    },
  }
  await assert.rejects(() => spawnRoleMember({
    ctx,
    config: {},
    snapshots: {
      get: () => undefined,
      record: async (record) => { recorded.push(record) },
      remove: async (root, name) => { removed.push([root, name]) },
    },
    roles: [role],
    caller: { id: 'lead-session' },
    roleId: 'se',
    prompt: 'task',
    signal: undefined,
  }), /backend failed/)
  assert.equal(recorded.length, 1)
  assert.deepEqual(removed, [['lead-session', 'se']])
})

test('an unknown role is refused before a snapshot is written', async () => {
  const harness = build()
  await assert.rejects(() => spawnRoleMember({
    ctx: harness.ctx,
    config: {},
    snapshots: harness.snapshots,
    roles: [role],
    caller: { id: 'lead-session' },
    roleId: 'missing',
    prompt: 'task',
    signal: undefined,
  }), /unknown role/)
  assert.equal(harness.recorded.length, 0)
})

test('a handshake spawn asks for caller delivery and restores the service', async () => {
  const specs = []
  const original = async (spec) => {
    specs.push(spec)
    return { member: { name: 'se', status: 'running' } }
  }
  const subagents = { startActivation: original }
  const ctx = {
    get: (name) => (name === 'subagents' ? subagents : undefined),
    agentTeams: {
      listMembers: () => [],
      spawnTeammate: async (_caller, request) => {
        await subagents.startActivation({ request: { prompt: request.prompt } })
        return { member: { name: request.name, status: 'running' } }
      },
      sendMessage: async () => { throw new Error('not used') },
    },
  }
  await spawnRoleMember({
    ctx,
    config: {},
    snapshots: { get: () => undefined, record: async () => undefined, remove: async () => undefined },
    roles: [role],
    caller: { id: 'lead-session' },
    roleId: 'se',
    prompt: '[[TEAM_HANDSHAKE]] reply READY',
    signal: undefined,
  })
  assert.equal(specs[0].delivery, 'caller')
  assert.equal(subagents.startActivation, original)
})
