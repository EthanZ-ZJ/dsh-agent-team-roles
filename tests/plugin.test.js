import test from 'node:test'
import assert from 'node:assert/strict'
import { isHandshakeOnly, isHandshakeSettlement } from '../src/plugin.js'

const ctx = {
  agentTeams: {
    listMembers: () => [{ id: 'child-1' }, { id: 'child-2' }],
  },
}
const lead = { id: 'lead' }

function notice(sender = 'child-1', closing = 'READY') {
  return {
    source: { kind: 'subagent-settled', senderSessionId: sender },
    content: [
      { type: 'text', text: 'Background subagent finished and will do no further work.' },
      { type: 'text', text: 'Its closing message:' },
      { type: 'text', text: closing },
    ],
  }
}

test('a Team member READY settlement notice is recognized', () => {
  assert.equal(isHandshakeSettlement(ctx, lead, notice()), true)
  assert.equal(isHandshakeOnly(ctx, lead, [notice()]), true)
})

test('a non-READY settlement notice is not a handshake', () => {
  assert.equal(isHandshakeSettlement(ctx, lead, notice('child-1', 'Task complete')), false)
})

test('a settlement from a non-Team child is not a handshake', () => {
  assert.equal(isHandshakeSettlement(ctx, lead, notice('outsider')), false)
})

test('mixed claimed messages are never collapsed', () => {
  assert.equal(isHandshakeOnly(ctx, lead, [notice(), { source: { kind: 'user' }, content: [] }]), false)
  assert.equal(isHandshakeOnly(ctx, lead, []), false)
})
