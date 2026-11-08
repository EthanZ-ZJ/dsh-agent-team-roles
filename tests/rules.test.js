import test from 'node:test'
import assert from 'node:assert/strict'
import { applyRule, applySessionRule, renderRules, ruleView } from '../src/rules.js'

const base = (input) => ({
  id: `rule-${Math.random()}`,
  roleId: 'reviewer',
  text: 'Do not modify tests',
  polarity: 'dont',
  scope: 'permanent',
  source: 'lead',
  ...input,
})

test('permanent rule is active immediately', () => {
  const result = applyRule([], base({}))
  assert.equal(result.refusal, undefined)
  assert.equal(result.rule.status, 'active')
  assert.equal(result.promoted, true)
})

test('repeating a candidate promotes it on the second observation', () => {
  const first = applyRule([], base({ scope: 'candidate' }))
  assert.equal(first.rule.status, 'candidate')
  const second = applyRule(first.rules, base({ scope: 'candidate' }))
  assert.equal(second.rule.status, 'active')
  assert.equal(second.rule.evidence, 2)
  assert.equal(second.promoted, true)
})

test('a permanent observation promotes an existing candidate', () => {
  const first = applyRule([], base({ scope: 'candidate' }))
  const second = applyRule(first.rules, base({ scope: 'permanent' }))
  assert.equal(second.rule.status, 'active')
  assert.equal(second.rule.evidence, 2)
})

test('opposite polarity supersedes the old rule instead of stacking', () => {
  const first = applyRule([], base({ polarity: 'dont' }))
  const second = applyRule(first.rules, base({ polarity: 'do' }))
  assert.equal(second.rules.length, 2)
  assert.equal(second.rules[0].status, 'superseded')
  assert.equal(second.rules[1].status, 'active')
  assert.equal(second.rules[1].polarity, 'do')
})

test('superseded rules render nothing', () => {
  const first = applyRule([], base({ polarity: 'dont' }))
  const second = applyRule(first.rules, base({ polarity: 'do' }))
  const text = renderRules(second.rules, 'reviewer')
  assert.match(text, /Do not modify tests/)
  assert.equal(text.match(/Do not modify tests/g)?.length, 1)
})

test('session rules render only for their own role', () => {
  const session = applySessionRule([], base({ roleId: 'reviewer', text: 'Prefer pnpm' }))
  assert.match(renderRules([], 'reviewer', session.rules), /Prefer pnpm/)
  assert.equal(renderRules([], 'writer', session.rules), '')
})

test('rule view exposes only stable fields', () => {
  const result = applyRule([], base({}))
  assert.deepEqual(Object.keys(ruleView(result.rule)).sort(), [
    'evidence', 'id', 'polarity', 'roleId', 'source', 'status', 'text',
  ])
})

test('the per-role limit refuses a new rule', () => {
  let rules = []
  for (let index = 0; index < 40; index += 1) {
    const result = applyRule(rules, base({ text: `rule ${index}` }))
    assert.equal(result.refusal, undefined)
    rules = result.rules
  }
  const refused = applyRule(rules, base({ text: 'one too many' }))
  assert.match(refused.refusal, /reached 40 rules/)
})
