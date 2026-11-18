import test from 'node:test'
import assert from 'node:assert/strict'
import { GateLedger } from '../src/ledger.js'

test('record and fresh keep event history and return the latest match', () => {
  const ledger = new GateLedger()
  ledger.record('team-1', 'review-approved', 'reviewer', 1000)
  ledger.record('team-1', 'review-approved', 'reviewer', 2000)
  assert.equal(ledger.fresh('team-1', 'review-approved', ['reviewer'], undefined, 2500).at, 2000)
  assert.equal(ledger.buckets.get('team-1').length, 2)
})

test('fresh filters by producer role', () => {
  const ledger = new GateLedger()
  ledger.record('team-1', 'review-approved', 'outsider', 1000)
  assert.equal(ledger.fresh('team-1', 'review-approved', ['reviewer'], undefined, 1000), undefined)
  ledger.record('team-1', 'review-approved', 'reviewer', 1100)
  assert.equal(ledger.fresh('team-1', 'review-approved', ['reviewer'], undefined, 1100).role, 'reviewer')
})

test('freshFor expires events using the injected clock', () => {
  const ledger = new GateLedger()
  ledger.record('team-1', 'review-approved', 'reviewer', 10_000)
  assert.equal(ledger.fresh('team-1', 'review-approved', ['reviewer'], 60, 70_000).at, 10_000)
  assert.equal(ledger.fresh('team-1', 'review-approved', ['reviewer'], 60, 70_001), undefined)
})

test('invalidate clears the team bucket', () => {
  const ledger = new GateLedger()
  ledger.record('team-1', 'review-approved', 'reviewer')
  ledger.record('team-1', 'gate:x:command-success', 'tse')
  ledger.invalidate('team-1')
  assert.equal(ledger.fresh('team-1', 'review-approved', ['reviewer']), undefined)
  assert.equal(ledger.latest('team-1', 'review-approved'), undefined)
})

test('teams are isolated from each other', () => {
  const ledger = new GateLedger()
  ledger.record('team-1', 'review-approved', 'reviewer')
  assert.equal(ledger.fresh('team-2', 'review-approved', ['reviewer']), undefined)
  ledger.record('team-2', 'review-approved', 'reviewer')
  assert.notEqual(ledger.fresh('team-1', 'review-approved', ['reviewer']), undefined)
  assert.notEqual(ledger.fresh('team-2', 'review-approved', ['reviewer']), undefined)
})

test('latest ignores the freshness window and filters by role when given', () => {
  const ledger = new GateLedger()
  ledger.record('team-1', 'review-approved', 'reviewer', 1000)
  assert.equal(ledger.latest('team-1', 'review-approved').at, 1000)
  assert.equal(ledger.latest('team-1', 'review-approved', ['other']), undefined)
})

test('a restart (fresh instance) forgets every recorded event', () => {
  const first = new GateLedger()
  first.record('team-1', 'review-approved', 'reviewer')
  const restarted = new GateLedger()
  assert.equal(restarted.fresh('team-1', 'review-approved', ['reviewer']), undefined)
})
