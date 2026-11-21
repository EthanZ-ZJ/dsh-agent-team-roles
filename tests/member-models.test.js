import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRootView, describeMember, memberModelsRoute } from '../src/member-models.js'

const role = {
  id: 'dev',
  name: 'DEV',
  provider: 'p1',
  model: 'm1',
  reasoningEffort: 'high',
  fallbackProvider: 'p2',
  fallbackModel: 'm2',
}

test('a manual pick is labelled manual for both a live and a dormant member', () => {
  const role = { id: 'dev', provider: 'zai', model: 'glm-5.3-flash', reasoningEffort: 'high' }
  const override = { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'low', route: 'manual', via: 'lead', at: 7 }
  const live = describeMember({
    name: 'dev', status: 'running', role,
    live: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'low' },
    override, hasAgent: true,
  })
  assert.equal(live.source, 'manual')
  assert.equal(live.model, 'deepseek-flash')
  assert.equal(live.pending, false)
  const dormant = describeMember({ name: 'dev', status: 'inactive', role, override, hasAgent: false })
  assert.equal(dormant.source, 'manual')
  assert.equal(dormant.pending, true)
  assert.equal(dormant.changedAt, 7)
})

test('a live selection matching the primary route reports primary', () => {
  const view = describeMember({
    name: 'dev',
    status: 'active',
    role,
    live: { provider: 'p1', model: 'm1', reasoningEffort: 'high' },
    hasAgent: true,
  })
  assert.equal(view.source, 'primary')
  assert.equal(view.provider, 'p1')
  assert.equal(view.pending, false)
})

test('a live selection matching the fallback route reports the override via', () => {
  const auto = describeMember({
    name: 'dev',
    status: 'active',
    role,
    live: { provider: 'p2', model: 'm2' },
    override: { provider: 'p2', model: 'm2', via: 'auto', at: 123 },
    hasAgent: true,
  })
  assert.equal(auto.source, 'fallback-auto')
  assert.equal(auto.changedAt, 123)
  const manual = describeMember({
    name: 'dev',
    status: 'active',
    role,
    live: { provider: 'p2', model: 'm2' },
    override: { provider: 'p2', model: 'm2', via: 'lead', at: 456 },
    hasAgent: true,
  })
  assert.equal(manual.source, 'fallback-manual')
})

test('effort distinguishes primary and fallback on the same model', () => {
  const sameModel = { ...role, fallbackProvider: 'p1', fallbackModel: 'm1', fallbackReasoningEffort: 'low' }
  const input = { name: 'dev', role: sameModel }
  const fallback = { provider: 'p1', model: 'm1', reasoningEffort: 'low' }
  const live = describeMember({ ...input, live: fallback, override: { ...fallback, route: 'fallback', via: 'auto' } })
  assert.equal(live.source, 'fallback-auto')
  assert.equal(live.reasoningEffort, 'low')
  const pending = describeMember({ ...input, override: { provider: 'p1', model: 'm1', reasoningEffort: 'high', route: 'primary' } })
  assert.equal(pending.source, 'primary')
  assert.equal(pending.reasoningEffort, 'high')
  assert.equal(pending.pending, true)
})

test('a dormant member uses the pending override and marks it pending', () => {
  const view = describeMember({
    name: 'dev',
    status: 'inactive',
    role,
    override: { provider: 'p2', model: 'm2', via: 'auto', at: 9 },
  })
  assert.equal(view.provider, 'p2')
  assert.equal(view.source, 'fallback-auto')
  assert.equal(view.pending, true)
})

test('without live state or override the role route is shown; empty role follows the session', () => {
  const fromRole = describeMember({ name: 'dev', status: 'inactive', role })
  assert.equal(fromRole.provider, 'p1')
  assert.equal(fromRole.source, 'primary')
  assert.equal(fromRole.pending, true)

  const inherits = describeMember({
    name: 'general',
    status: 'inactive',
    role: { id: 'general', provider: '', model: '' },
  })
  assert.equal(inherits.provider, '')
  assert.equal(inherits.source, 'session')
})

test('buildRootView lists the lead selection and every teammate', () => {
  const root = buildRootView({
    rootId: 'root-1',
    leadSelection: { provider: 'p1', model: 'm1' },
    roster: [{ name: 'dev', status: 'active' }, { name: 'general', status: 'failed' }],
    roleOf: (name) => (name === 'dev' ? role : { id: 'general', provider: '', model: '' }),
    liveOf: (name) => (name === 'dev' ? { provider: 'p2', model: 'm2' } : undefined),
    overrideOf: (name) => (name === 'dev' ? { provider: 'p2', model: 'm2', via: 'auto', at: 1 } : undefined),
  })
  assert.equal(root.rootId, 'root-1')
  assert.equal(root.lead.provider, 'p1')
  assert.deepEqual(root.members.map((member) => member.name), ['dev', 'general'])
  assert.equal(root.members[0].source, 'fallback-auto')
  assert.equal(root.members[1].status, 'failed')
})

test('memberModelsRoute serves JSON and rejects non-GET', async () => {
  const route = memberModelsRoute(() => [{ rootId: 'root-1', lead: {}, members: [] }])
  assert.equal(route.path, '/agent-team-roles/member-models')
  const ok = await route.resource(new Request('http://localhost/agent-team-roles/member-models'))
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).roots.length, 1)
  const denied = await route.resource(new Request('http://localhost/agent-team-roles/member-models', { method: 'POST' }))
  assert.equal(denied.status, 405)
  const broken = memberModelsRoute(() => { throw new Error('boom') })
  const fallback = await broken.resource(new Request('http://localhost/agent-team-roles/member-models'))
  assert.deepEqual(await fallback.json(), { roots: [] })
})
