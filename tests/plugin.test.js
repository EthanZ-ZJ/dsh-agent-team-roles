import test from 'node:test'
import assert from 'node:assert/strict'
import { isHandshakeOnly, isHandshakeSettlement } from '../src/plugin.js'

function notice(closing = 'READY') {
  return {
    source: {
      kind: 'subagent-settled',
      senderSessionId: 'child-1',
      summary: 'Background subagent child-1 finished',
    },
    content: [
      { type: 'text', text: 'Background subagent child-1 finished and will do no further work.' },
      { type: 'text', text: 'Its closing message:' },
      { type: 'text', text: closing },
    ],
  }
}

test('a background subagent READY settlement is recognized', () => {
  assert.equal(isHandshakeSettlement(notice()), true)
  assert.equal(isHandshakeOnly([notice()]), true)
})

test('a non-READY settlement is not a handshake', () => {
  assert.equal(isHandshakeSettlement(notice('Task complete')), false)
})

test('an ordinary user message is not a handshake', () => {
  assert.equal(isHandshakeSettlement({ source: { kind: 'user' }, content: [{ type: 'text', text: 'READY' }] }), false)
})

test('mixed claimed messages are never collapsed', () => {
  assert.equal(isHandshakeOnly([notice(), { source: { kind: 'user' }, content: [] }]), false)
  assert.equal(isHandshakeOnly([]), false)
})
