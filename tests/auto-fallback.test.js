import test from 'node:test'
import assert from 'node:assert/strict'
import { isTransientFailure, shouldAutoSwitch } from '../src/auto-fallback.js'

test('transient failures stay with the harness retry policy', () => {
  assert.equal(isTransientFailure({ message: 'rate limited', status: 429, code: 'RATE_LIMIT' }), true)
  assert.equal(isTransientFailure({ message: 'server error', status: 503, code: 'UPSTREAM' }), true)
  assert.equal(isTransientFailure({ message: 'socket hang up', code: 'ECONNRESET' }), true)
  assert.equal(isTransientFailure({ message: 'timeout', code: 'TIMEOUT' }), true)
  assert.equal(isTransientFailure({ message: 'aborted', code: 'ABORTED' }), true)
})

test('terminal failures trigger the switch', () => {
  assert.equal(shouldAutoSwitch({ message: 'insufficient balance', status: 402, code: 'BALANCE' }), true)
  assert.equal(shouldAutoSwitch({ message: 'invalid api key', status: 401, code: 'AUTH' }), true)
  assert.equal(shouldAutoSwitch({ message: 'model not found', status: 404, code: 'NOT_FOUND' }), true)
  assert.equal(shouldAutoSwitch({ message: 'boom', code: 'INTERNAL' }), true)
})

test('no switch while already on the fallback or after this turn tried once', () => {
  assert.equal(shouldAutoSwitch({ message: 'boom', code: 'X' }, { alreadyFallback: true }), false)
  assert.equal(shouldAutoSwitch({ message: 'boom', code: 'X' }, { attempted: true }), false)
  assert.equal(shouldAutoSwitch({ message: 'rate limited', status: 429, code: 'R' }), false)
})
