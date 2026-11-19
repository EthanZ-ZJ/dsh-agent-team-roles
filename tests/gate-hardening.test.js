/**
 * v4 hardening checks (D9): the read-side gate audit, template gate merging,
 * and the wiring that keeps a bad gate from blocking unrelated work.
 *
 * These target the exports DEV locked for v4:
 *   - src/gates.js:      auditGateList(rawGates, warn?) -> {valid, invalid}
 *   - src/templates.js:  mergeTemplateGates(existing, incoming, {max}) -> {gates, replaced, error}
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { auditGateList, evaluateGates, MAX_GATES, validateGate, normalizeGate } from '../src/gates.js'
import { mergeTemplateGates } from '../src/templates.js'
import { GateLedger } from '../src/ledger.js'

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
const pluginSrc = read('../src/plugin.js')

function gate(overrides = {}) {
  return normalizeGate({
    id: 'checks-passed',
    deny: { role: 'worker', tool: ['bash', 'pwsh'] },
    require: { event: 'checks-passed', byRoles: ['checker'] },
    description: 'generic gate',
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// D9 layer 3: host read-side audit (fail-open, warn once per id, no throw)
// ---------------------------------------------------------------------------

test('auditGateList reports semantic-invalid gates and keeps the valid ones (D9 L3)', () => {
  const warnings = []
  const result = auditGateList(
    [
      gate(),
      { id: 'broken-role', deny: { role: '', tool: ['bash'] }, require: { event: 'ok', byRoles: ['checker'] } },
      { id: 'broken-regex', deny: { role: 'worker', tool: ['bash'], commandPattern: '([bad' }, require: { event: 'ok', byRoles: ['checker'] } },
    ],
    (message) => warnings.push(message),
  )
  assert.equal(result.valid.length, 1)
  assert.equal(result.valid[0].id, 'checks-passed')
  assert.deepEqual(result.invalid.map((entry) => entry.id).sort(), ['broken-regex', 'broken-role'])
  for (const entry of result.invalid) {
    assert.equal(typeof entry.reason, 'string')
    assert.ok(entry.reason.length > 0, `gate ${entry.id} needs a reason`)
  }
  assert.equal(warnings.length, 2, 'one warning per invalid gate id')
  for (const warning of warnings) assert.equal(typeof warning, 'string')
})

test('auditGateList never throws for hostile or non-array input (fail-open)', () => {
  for (const input of [undefined, null, 'not-an-array', 42, [null], [{}], [{ id: 'x' }]]) {
    assert.doesNotThrow(() => auditGateList(input, () => {}), `input ${JSON.stringify(input)} must not throw`)
  }
})

test('auditGateList flags duplicate ids that normalizeGates would silently drop (D9 L3)', () => {
  const warnings = []
  const duplicate = gate({ id: 'dup-gate' })
  const result = auditGateList([duplicate, { ...duplicate }], (message) => warnings.push(message))
  assert.equal(result.valid.length, 1)
  assert.equal(result.invalid.length, 1)
  assert.equal(result.invalid[0].id, 'dup-gate')
  assert.match(result.invalid[0].reason, /^duplicate gate id/)
  const duplicateWarnings = warnings.filter((message) => message.includes('dup-gate'))
  assert.equal(duplicateWarnings.length, 1, 'a duplicate id is warned once per id')
})

test('auditGateList warns once per id even when several raw entries share it', () => {
  const warnings = []
  const broken = { id: 'same-broken', deny: { role: '', tool: ['bash'] }, require: { event: 'ok', byRoles: ['checker'] } }
  const result = auditGateList([broken, { ...broken }], (message) => warnings.push(message))
  assert.ok(result.invalid.length >= 1)
  assert.ok(result.invalid.every((entry) => entry.id === 'same-broken'))
  assert.equal(warnings.filter((message) => message.includes('same-broken')).length, 1, 'a repeated bad id is warned once')
})

test('a bad gate does not change a valid gate decision (fail-open)', () => {
  const ledger = new GateLedger()
  const decision = evaluateGates({
    gates: [
      { id: 'broken', deny: {}, require: {} },
      gate(),
    ],
    role: 'worker',
    tool: 'pwsh',
    args: { command: 'run checks' },
    ledger,
    teamId: 'team-1',
  })
  assert.equal(decision?.kind, 'deny')
  assert.match(decision.reason, /checks-passed/)
})

test('the plugin read path audits raw gates before and after execution (D9 wiring)', () => {
  const calls = [...pluginSrc.matchAll(/auditGateList\s*\(/g)].length
  assert.ok(calls >= 2, 'pre-execute and post-execute must both audit the raw gate list')
  // Process-level "warn once per id" marker must be a Set (contract §12 R4.3).
  assert.match(pluginSrc, /warned[A-Za-z]*\s*=\s*new Set\(|new Set\(\).*warn/i)
})

// ---------------------------------------------------------------------------
// D9 layer 2: template gate merge
// ---------------------------------------------------------------------------

test('mergeTemplateGates refuses to exceed MAX_GATES instead of truncating (D9 L2)', () => {
  const existing = Array.from({ length: MAX_GATES }, (_, index) => gate({ id: `gate-${index}` }))
  const incoming = [gate({ id: 'newcomer' })]
  const result = mergeTemplateGates(existing, incoming)
  assert.ok(result.error, 'an over-limit apply must report an error')
  assert.match(result.error, /exceed|MAX_GATES|50/i)
  assert.deepEqual(result.gates, [], 'nothing is written on rejection')
  assert.deepEqual(result.replaced, [])
})

test('mergeTemplateGates replaces same-id gates and reports replaced ids (D9 L2)', () => {
  const existing = [gate({ id: 'alpha' }), gate({ id: 'beta' })]
  const incoming = [gate({ id: 'alpha', description: 'replacement' }), gate({ id: 'gamma' })]
  const result = mergeTemplateGates(existing, incoming)
  assert.equal(result.error, undefined)
  assert.deepEqual(result.replaced, ['alpha'])
  assert.deepEqual(result.gates.map((entry) => entry.id).sort(), ['alpha', 'beta', 'gamma'])
  assert.equal(result.gates.find((entry) => entry.id === 'alpha').description, 'replacement')
  assert.equal(result.gates.find((entry) => entry.id === 'beta').description, 'generic gate')
})

test('mergeTemplateGates allows filling the last slot but not overfilling it', () => {
  const existing = Array.from({ length: MAX_GATES - 1 }, (_, index) => gate({ id: `gate-${index}` }))
  const result = mergeTemplateGates(existing, [gate({ id: 'last-slot' })])
  assert.equal(result.error, undefined)
  assert.equal(result.gates.length, MAX_GATES)
  const overflow = mergeTemplateGates(result.gates, [gate({ id: 'one-too-many' })])
  assert.ok(overflow.error)
})

test('mergeTemplateGates rejects duplicate incoming ids and invalid template gates', () => {
  const duplicate = mergeTemplateGates([], [gate({ id: 'twice' }), gate({ id: 'twice' })])
  assert.ok(duplicate.error, 'duplicate template ids must be rejected')

  const invalid = mergeTemplateGates([], [{
    id: 'template-bad',
    deny: { role: 'worker', tool: [] },
    require: { event: 'ok', byRoles: ['checker'] },
  }])
  assert.ok(invalid.error, 'an invalid template gate must be rejected')
  assert.deepEqual(invalid.gates, [])
})

test('the template apply handler uses the pure merge helper (D9 wiring)', () => {
  assert.match(pluginSrc, /mergeTemplateGates\s*\(/, 'the command must delegate to mergeTemplateGates')
})

// ---------------------------------------------------------------------------
// Keep legacy evaluator semantics green while the read path changes
// ---------------------------------------------------------------------------

test('a well-formed gate still validates and normalizes identically', () => {
  assert.equal(validateGate(gate()), undefined)
})
