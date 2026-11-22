import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DISPATCH_TOOLS,
  SELF_SERVICE_TOOLS,
  createLeadWorkflowCounter,
  leadWorkflowPolicy,
  preDispatchRefusal,
  selfWorkRefusal,
} from '../src/lead-workflow.js'

test('the default policy allows one self-check before a dispatch and three per turn', () => {
  const policy = leadWorkflowPolicy()
  assert.equal(policy.mode, 'dispatch-first')
  assert.equal(policy.preDispatchBudget, 1)
  assert.equal(policy.selfBudget, 3)
})

test('invalid numbers fall back and an unknown mode keeps the enforced default', () => {
  const policy = leadWorkflowPolicy({ mode: 'lax', selfBudget: -2, preDispatchBudget: 'x' })
  assert.equal(policy.mode, 'dispatch-first')
  assert.equal(policy.selfBudget, 3)
  assert.equal(policy.preDispatchBudget, 1)
  assert.equal(leadWorkflowPolicy({ mode: 'off' }).mode, 'off')
  assert.equal(leadWorkflowPolicy({ selfBudget: 0 }).selfBudget, 0, 'an explicit zero is a valid budget')
})

test('a new turn resets the counters without a turn-end event', () => {
  const counter = createLeadWorkflowCounter()
  counter.reset(1)
  counter.use()
  counter.use()
  assert.equal(counter.used, 2)
  counter.reset(2)
  assert.equal(counter.used, 0)
  assert.equal(counter.dispatched, false)
})

test('a dispatch is recognised and survives later self-checks in the same turn', () => {
  const counter = createLeadWorkflowCounter()
  counter.reset(1)
  assert.equal(counter.observeDispatch('read'), false)
  assert.equal(counter.observeDispatch('spawn_team_member'), true)
  assert.equal(counter.dispatched, true)
  counter.use()
  assert.equal(counter.dispatched, true)
})

test('the tool lists cover dispatching and self-checking without overlap', () => {
  for (const name of ['spawn_team_member', 'send_message', 'team_task_create', 'team_task_update']) {
    assert.ok(DISPATCH_TOOLS.includes(name), `${name} dispatches`)
  }
  for (const name of ['read', 'grep', 'glob', 'read_image']) {
    assert.ok(SELF_SERVICE_TOOLS.includes(name), `${name} is a self-check`)
  }
  assert.deepEqual(DISPATCH_TOOLS.filter((name) => SELF_SERVICE_TOOLS.includes(name)), [])
})

test('both refusals tell the Lead to dispatch instead of investigating', () => {
  assert.match(preDispatchRefusal(1), /Dispatch the work before investigating further/)
  assert.match(preDispatchRefusal(1), /spawn_team_member/)
  assert.match(preDispatchRefusal(1), /Do not keep inspecting the code yourself/)
  assert.match(selfWorkRefusal(3), /budget for this turn is 3 call\(s\)/)
  assert.match(selfWorkRefusal(3), /Hand the remaining investigation/)
  assert.match(selfWorkRefusal(3), /not what you analysed/)
})
