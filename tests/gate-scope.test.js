import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveDisabledGates, gateState } from '../src/gates.js'
import { buildGateView, gatesRoute } from '../src/gate-view.js'

const gate = {
  id: 'review-before-commit',
  description: 'review first',
  deny: { role: 'dev', tool: ['bash', 'pwsh'], commandPattern: '\\bgit\\s+commit\\b' },
  require: { event: 'review-approved', byRoles: ['cr'], freshFor: 3600 },
}

test('session overrides win over the global default', () => {
  const globalDisabled = new Set(['a'])
  assert.equal(gateState(globalDisabled, undefined, 'a'), 'off-global')
  assert.equal(gateState(globalDisabled, new Map([['a', true]]), 'a'), 'off-session')
  assert.equal(gateState(globalDisabled, new Map([['a', false]]), 'a'), 'on-session')
  assert.equal(gateState(globalDisabled, new Map([['b', true]]), 'b'), 'off-session')
  assert.equal(gateState(new Set(), new Map(), 'c'), 'on')
})

test('effective disabled set merges global defaults with session overrides', () => {
  const gates = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const disabled = effectiveDisabledGates(gates, new Set(['a']), new Map([['b', true], ['a', false]]))
  assert.deepEqual(disabled.sort(), ['b'])
})

test('buildGateView exposes state, applicability and summaries', () => {
  const view = buildGateView({
    gates: [gate, { ...gate, id: 'other', require: { commandSuccess: { role: 'tse', tool: ['pwsh'], pattern: 'test' } } }],
    globalDisabled: new Set(),
    sessionMap: new Map([['review-before-commit', true]]),
    liveRoles: new Set(['dev']),
  })
  assert.equal(view.gates[0].state, 'off-session')
  assert.equal(view.gates[0].applicable, false, 'no cr member => inapplicable')
  assert.equal(view.gates[0].deny, 'dev bash/pwsh /\\bgit\\s+commit\\b/')
  assert.equal(view.gates[0].require, 'event "review-approved" from cr')
  assert.equal(view.gates[1].require, 'successful pwsh command from tse')
})

test('gatesRoute serves one session view and tolerates unknown sessions', async () => {
  const route = gatesRoute((sessionId) => (sessionId === 'root-1'
    ? { gates: [{ id: 'a', state: 'on', applicable: true }] }
    : undefined))
  assert.equal(route.path, '/agent-team-roles/gates')
  const ok = await route.resource(new Request('http://localhost/agent-team-roles/gates/root-1'))
  assert.equal((await ok.json()).gates.length, 1)
  const unknown = await route.resource(new Request('http://localhost/agent-team-roles/gates/root-2'))
  assert.equal((await unknown.json()).reason, 'session is not a Team Lead session')
  const denied = await route.resource(new Request('http://localhost/agent-team-roles/gates/root-1', { method: 'POST' }))
  assert.equal(denied.status, 405)
})
