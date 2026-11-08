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

function build({ existing = ['se'] } = {}) {
  const recorded = []
  const removed = []
  const spawned = []
  const ctx = {
    agentTeams: {
      listMembers: () => existing.map((name) => ({ name })),
      spawnTeammate: async (_caller, request) => {
        spawned.push(request)
        return { member: { name: request.name, status: 'running' } }
      },
    },
  }
  const snapshots = {
    record: async (record) => { recorded.push(record) },
    remove: async (rootSessionId, name) => { removed.push([rootSessionId, name]) },
  }
  return { ctx, snapshots, recorded, removed, spawned }
}

test('a spawn records a frozen snapshot and suffixes a taken target', async () => {
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
  assert.equal(member.target, 'se-2')
  assert.equal(member.role, 'se')
  assert.equal(member.context, 'fresh')
  assert.equal(harness.recorded.length, 1)
  assert.equal(harness.recorded[0].name, 'se-2')
  assert.equal(harness.recorded[0].frozen.id, 'se')
  assert.equal(harness.spawned[0].provider, 'spawn')
  assert.deepEqual(harness.removed, [])
})

test('a failed spawn removes the recorded snapshot', async () => {
  const recorded = []
  const removed = []
  const ctx = {
    agentTeams: {
      listMembers: () => [],
      spawnTeammate: async () => { throw new Error('backend failed') },
    },
  }
  await assert.rejects(() => spawnRoleMember({
    ctx,
    config: {},
    snapshots: {
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
    },
  }
  await spawnRoleMember({
    ctx,
    config: {},
    snapshots: { record: async () => undefined, remove: async () => undefined },
    roles: [role],
    caller: { id: 'lead-session' },
    roleId: 'se',
    prompt: '[[TEAM_HANDSHAKE]] reply READY',
    signal: undefined,
  })
  assert.equal(specs[0].delivery, 'caller')
  assert.equal(subagents.startActivation, original)
})
