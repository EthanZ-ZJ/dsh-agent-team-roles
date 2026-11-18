import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_GATES,
  evaluateGates,
  normalizeGate,
  normalizeGates,
  validateGate,
} from '../src/gates.js'
import { GateLedger } from '../src/ledger.js'

function gate(overrides = {}) {
  return {
    id: 'review-before-commit',
    deny: { role: 'dev', tool: ['bash', 'pwsh'], commandPattern: '\\bgit\\s+commit\\b' },
    require: { event: 'review-approved', byRoles: ['reviewer'], freshFor: 60 },
    description: 'test gate',
    ...overrides,
  }
}

function fakeLedger() {
  return new GateLedger()
}

test('validateGate accepts a well-formed event gate', () => {
  assert.equal(validateGate(normalizeGate(gate())), undefined)
})

test('validateGate rejects bad ids, patterns and bounds', () => {
  assert.match(validateGate(normalizeGate(gate({ id: 'Bad Gate' }))), /lowercase kebab-case/)
  assert.match(validateGate(normalizeGate({ ...gate(), deny: { role: 'dev', tool: [], commandPattern: '' } })), /at least one tool/)
  assert.match(validateGate(normalizeGate({ ...gate(), deny: { role: 'dev', tool: ['bash'], commandPattern: '([bad' } })), /not a valid regex/)
  assert.match(
    validateGate(normalizeGate({ ...gate(), deny: { role: 'dev', tool: ['bash'], commandPattern: 'x'.repeat(201) } })),
    /exceeds 200/,
  )
  assert.match(validateGate(normalizeGate({ ...gate(), require: { byRoles: ['r'] } })), /must require an event or a commandSuccess/)
  assert.match(
    validateGate(normalizeGate(gate({
      require: {
        event: 'x',
        byRoles: ['r'],
        commandSuccess: { role: 'tse', tool: ['pwsh'], pattern: 'test' },
      },
    }))),
    /cannot require both/,
  )
  assert.match(
    validateGate(normalizeGate({ ...gate(), require: { event: 'x', byRoles: [] } })),
    /at least one role/,
  )
})

test('normalizeGates dedupes by id and caps at the team limit', () => {
  const gates = normalizeGates([
    gate(),
    gate(),
    ...Array.from({ length: MAX_GATES }, (_, index) => gate({ id: `gate-${index}` })),
  ])
  assert.equal(gates.length, MAX_GATES)
  assert.equal(gates[0].id, 'review-before-commit')
})

test('evaluateGates denies a matching call without a fresh event', () => {
  const ledger = fakeLedger()
  const decision = evaluateGates({
    gates: [gate()],
    role: 'dev',
    tool: 'pwsh',
    args: { command: 'git commit -m x' },
    ledger,
    teamId: 'team-1',
  })
  assert.equal(decision.kind, 'deny')
  assert.match(decision.reason, /Blocked by gate 'review-before-commit'/)
  assert.match(decision.reason, /report_gate_event\(\{ event: 'review-approved' \}\)/)
  assert.match(decision.reason, /Current state: none/)
})

test('evaluateGates allows after a fresh event from a byRoles role; wrong roles do not count', () => {
  const ledger = fakeLedger()
  ledger.record('team-1', 'review-approved', 'outsider')
  assert.equal(evaluateGates({ gates: [gate()], role: 'dev', tool: 'pwsh', args: { command: 'git commit' }, ledger, teamId: 'team-1' }).kind, 'deny')
  ledger.record('team-1', 'review-approved', 'reviewer')
  assert.equal(evaluateGates({ gates: [gate()], role: 'dev', tool: 'pwsh', args: { command: 'git commit' }, ledger, teamId: 'team-1' }), undefined)
})

test('evaluateGates refuses an expired event via the injected ledger clock', () => {
  let now = 1_000_000
  const ledger = new GateLedger(() => now)
  ledger.record('team-1', 'review-approved', 'reviewer')
  now += 61_000
  const decision = evaluateGates({
    gates: [gate({ require: { event: 'review-approved', byRoles: ['reviewer'], freshFor: 60 } })],
    role: 'dev', tool: 'pwsh', args: { command: 'git commit' }, ledger, teamId: 'team-1', now,
  })
  assert.equal(decision.kind, 'deny')
})

test('evaluateGates skips disabled gates and non-matching calls', () => {
  const ledger = fakeLedger()
  assert.equal(evaluateGates({
    gates: [gate()], disabled: ['review-before-commit'], role: 'dev', tool: 'pwsh',
    args: { command: 'git commit' }, ledger, teamId: 'team-1',
  }), undefined)
  assert.equal(evaluateGates({
    gates: [gate()], role: 'dev', tool: 'read', args: { file_path: 'x' }, ledger, teamId: 'team-1',
  }), undefined)
  assert.equal(evaluateGates({
    gates: [gate()], role: 'dev', tool: 'pwsh', args: { command: 'npm test' }, ledger, teamId: 'team-1',
  }), undefined)
  assert.equal(evaluateGates({
    gates: [gate()], role: 'other-role', tool: 'pwsh',
    args: { command: 'git commit' }, ledger, teamId: 'team-1',
  }), undefined)
})

test('commandPattern applies to shell tools only', () => {
  const gateNoShell = gate({ deny: { role: 'dev', tool: ['write'], commandPattern: '\\bgit\\s+commit\\b' } })
  const ledger = fakeLedger()
  assert.equal(evaluateGates({
    gates: [gateNoShell], role: 'dev', tool: 'write', args: { file_path: 'x' }, ledger, teamId: 'team-1',
  }), undefined)
})

test('a commandSuccess gate is satisfied by its success event, not by reported events', () => {
  const commandGate = gate({
    id: 'tests-green',
    require: {
      commandSuccess: { role: 'tse', tool: ['pwsh'], pattern: '\\b(pnpm|npm)\\s+test\\b' },
      byRoles: ['tse'],
      freshFor: 60,
    },
  })
  const ledger = fakeLedger()
  ledger.record('team-1', 'review-approved', 'reviewer')
  const denied = evaluateGates({
    gates: [commandGate], role: 'dev', tool: 'pwsh', args: { command: 'git commit' }, ledger, teamId: 'team-1',
  })
  assert.equal(denied.kind, 'deny')
  ledger.record('team-1', 'gate:tests-green:command-success', 'tse')
  assert.equal(evaluateGates({
    gates: [commandGate], role: 'dev', tool: 'pwsh', args: { command: 'git commit' }, ledger, teamId: 'team-1',
  }), undefined)
})

test('invalid gate entries are skipped rather than throwing', () => {
  const ledger = fakeLedger()
  assert.equal(evaluateGates({
    gates: [{ id: 'broken', deny: {}, require: {} }, gate()],
    role: 'dev', tool: 'pwsh', args: { command: 'git commit' }, ledger, teamId: 'team-1',
  }).kind, 'deny')
})
