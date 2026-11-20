import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/plugin.js'

function mount(roles) {
  const home = process.env.DSH_HOME
  process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'team-roles-chain-'))
  let requestError
  try {
    apply({
      get: () => undefined,
      fiber: {},
      agents: { list: () => [] },
      agentTeams: { tryMembership: () => ({ role: 'teammate', root: { id: 'root' }, name: 'dev' }) },
      on(event, listener) { if (event === 'agent/request-error') requestError = listener },
      effect(register, name) { if (name === 'agent-team-roles:auto-fallback') register() },
      provide() {},
      inject() {},
    }, { roles })
  } finally {
    if (home === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = home
  }
  return requestError
}

test('an automatic fallback advances through the chain at most twice per turn', async () => {
  const requestError = mount([{
    id: 'dev',
    fallbacks: [
      { provider: 'p', model: 'one' },
      { provider: 'p', model: 'two' },
      { provider: 'p', model: 'three' },
    ],
  }])
  const selected = []
  const payload = (turn) => ({
    agent: { model: { select: (value) => selected.push(value) } },
    turn,
    failure: { status: 402, message: 'quota exhausted' },
  })
  const next = () => undefined
  assert.deepEqual(await requestError(payload(1), next), { kind: 'retry' })
  assert.deepEqual(await requestError(payload(1), next), { kind: 'retry' })
  assert.equal(await requestError(payload(1), next), undefined, 'the second switch exhausts the per-turn budget')
  assert.deepEqual(await requestError(payload(2), next), { kind: 'retry' }, 'a new turn resumes the chain')
  assert.deepEqual(selected.map((route) => route.model), ['one', 'two', 'three'])
})

test('a transient failure never advances the chain', async () => {
  const requestError = mount([{ id: 'dev', fallbacks: [{ provider: 'p', model: 'one' }] }])
  const payload = { agent: { model: { select() { assert.fail('no switch') } } }, turn: 1, failure: { status: 503, message: 'service unavailable' } }
  assert.equal(await requestError(payload, () => undefined), undefined)
})
