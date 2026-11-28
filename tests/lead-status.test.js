import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createLeadStatusTool,
  LEAD_STATUS_TOOL,
  leadStatusProjection,
} from '../src/lead-status.js'

const lead = { id: 'root-session' }

function turnStart(seq, turn) {
  return { type: 'turn/start', seq, time: 1000 + seq, data: { turn } }
}

function turnEnd(seq, turn) {
  return { type: 'turn/end', seq, time: 1000 + seq, data: { turn } }
}

function statusCall(seq, turn, step, callId, args) {
  return {
    type: 'tool/call',
    seq,
    time: 1000 + seq,
    data: { turn, step, callId, name: LEAD_STATUS_TOOL, arguments: JSON.stringify(args) },
  }
}

function statusResult(seq, callSeq, turn, step, callId, value, options = {}) {
  return {
    type: 'tool/result',
    seq,
    time: 2000 + seq,
    sourceEventSeqs: [callSeq],
    data: {
      turn,
      step,
      ...(options.error === undefined ? {} : { error: options.error }),
      message: {
        toolCallId: callId,
        isError: options.isError === true,
        content: typeof value === 'string'
          ? [{ type: 'text', text: value }]
          : [{ type: 'text', text: JSON.stringify(value) }],
      },
    },
  }
}

function view(state) {
  return leadStatusProjection.wire.view(state)
}

function fold(events, inherited = 0) {
  let state = leadStatusProjection.init({}, inherited)
  for (const event of events) state = leadStatusProjection.apply(state, event)
  return state
}

test('the status tool records a bounded plain-text update for the active Lead', async () => {
  const tool = createLeadStatusTool((caller) => caller === lead)
  assert.equal(tool.name, LEAD_STATUS_TOOL)
  const value = await tool.execute({
    goal: 'Ship the review panel',
    summary: 'Panel wiring is in place.',
    next: 'Ask about the rollout choice.',
  }, { agent: lead })
  assert.equal(value.kind, 'agent-team-lead-status')
  assert.equal(value.goal, 'Ship the review panel')
  assert.equal(value.next, 'Ask about the rollout choice.')
  await assert.rejects(tool.execute({ goal: 'x', summary: 'y', next: '' }, { agent: { id: 'other' } }))
  await assert.rejects(tool.execute({ goal: '', summary: 'y', next: '' }, { agent: lead }))
  await assert.rejects(tool.execute({ goal: 'x\ny', summary: 'y', next: '' }, { agent: lead }))
})

test('a committed update becomes the session view for the current turn', () => {
  const args = { goal: 'Ship it', summary: 'Wired the panel.', next: 'Review the options.' }
  const state = fold([
    turnStart(1, 2),
    statusCall(2, 2, 3, 'call-1', args),
    statusResult(3, 2, 2, 3, 'call-1', { kind: 'agent-team-lead-status', ...args }),
  ])
  const status = view(state)
  assert.deepEqual({
    goal: status.goal,
    summary: status.summary,
    next: status.next,
    updatedTurn: status.updatedTurn,
    running: status.running,
  }, {
    goal: 'Ship it',
    summary: 'Wired the panel.',
    next: 'Review the options.',
    updatedTurn: 2,
    running: true,
  })
  const ended = leadStatusProjection.apply(state, turnEnd(4, 2))
  assert.equal(view(ended).running, false)
  assert.equal(view(ended).goal, 'Ship it')
})

test('a fabricated or mismatched result never becomes the view', () => {
  const args = { goal: 'Ship it', summary: 'Wired the panel.', next: '' }
  const forged = fold([
    turnStart(1, 1),
    statusCall(2, 1, 1, 'call-1', args),
    statusResult(3, 2, 1, 1, 'call-1', { kind: 'agent-team-lead-status', goal: 'Other', summary: 'x', next: '' }),
  ])
  assert.equal(view(forged), null)
  const failed = fold([
    turnStart(1, 1),
    statusCall(2, 1, 1, 'call-1', args),
    statusResult(3, 2, 1, 1, 'call-1', { kind: 'agent-team-lead-status', ...args }, { isError: true }),
  ])
  assert.equal(view(failed), null)
  const plain = fold([
    turnStart(1, 1),
    statusCall(2, 1, 1, 'call-1', args),
    statusResult(3, 2, 1, 1, 'call-1', 'not json'),
  ])
  assert.equal(view(plain), null)
})

test('an older call cannot overwrite a newer committed status', () => {
  const first = { goal: 'First', summary: 'One.', next: '' }
  const second = { goal: 'Second', summary: 'Two.', next: '' }
  const state = fold([
    turnStart(1, 1),
    statusCall(2, 1, 1, 'call-1', first),
    statusResult(3, 2, 1, 1, 'call-1', { kind: 'agent-team-lead-status', ...first }),
    statusCall(4, 1, 2, 'call-2', second),
    statusResult(5, 4, 1, 2, 'call-2', { kind: 'agent-team-lead-status', ...second }),
  ])
  const stale = leadStatusProjection.apply(state, statusResult(6, 2, 1, 1, 'call-1', { kind: 'agent-team-lead-status', ...first }))
  assert.equal(view(stale).goal, 'Second')
})

test('fork-inherited events and other turns do not seed or update the view', () => {
  const inherited = fold([
    turnStart(1, 1),
    statusCall(2, 1, 1, 'call-1', { goal: 'Parent', summary: 'Parent.', next: '' }),
    statusResult(3, 2, 1, 1, 'call-1', { kind: 'agent-team-lead-status', goal: 'Parent', summary: 'Parent.', next: '' }),
  ], 4)
  assert.equal(view(inherited), null)
  const otherTurn = fold([
    statusCall(1, 1, 1, 'call-1', { goal: 'x', summary: 'y', next: '' }),
    statusResult(2, 1, 1, 1, 'call-1', { kind: 'agent-team-lead-status', goal: 'x', summary: 'y', next: '' }),
  ])
  assert.equal(view(otherTurn), null)
})
