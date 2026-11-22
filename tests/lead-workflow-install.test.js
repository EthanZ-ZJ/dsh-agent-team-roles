import test from 'node:test'
import assert from 'node:assert/strict'
import { installLeadWorkflow } from '../src/plugin.js'

/** Scope stub recording the guard and prompt section the installer registers. */
function createScope() {
  const guards = []
  const sections = []
  const disposers = []
  const scoped = {
    tools: {
      guard(fn) {
        guards.push(fn)
        return () => {}
      },
    },
    systemPrompt: {
      getSectionOrder: () => 100,
      section(definition) {
        sections.push(definition)
        return () => {}
      },
    },
  }
  return {
    scoped,
    guards,
    sections,
    register: (disposer) => {
      if (typeof disposer === 'function') disposers.push(disposer)
    },
    disposers,
  }
}

function mount(config, turn = { value: 1 }) {
  const scope = createScope()
  installLeadWorkflow({
    ...scope,
    agent: { id: 'root' },
    config,
    turnOf: () => turn.value,
  })
  return { ...scope, guard: scope.guards[0], turn }
}

const defaults = () => ({ leadWorkflowMode: 'dispatch-first', leadSelfWorkBudget: 3, leadPreDispatchBudget: 1 })

test('the first self-check is allowed, the second before a dispatch is refused', () => {
  const mounted = mount(defaults())
  assert.equal(mounted.guard({ name: 'read', arguments: {} }), undefined)
  const refusal = mounted.guard({ name: 'grep', arguments: {} })
  assert.match(refusal, /Dispatch the work before investigating further/)
  assert.match(refusal, /spawn_team_member/)
})

test('a dispatch lifts the pre-dispatch limit and the per-turn budget still applies', () => {
  const mounted = mount(defaults())
  mounted.guard({ name: 'read', arguments: {} })
  assert.equal(mounted.guard({ name: 'spawn_team_member', arguments: {} }), undefined)
  assert.equal(mounted.guard({ name: 'read', arguments: {} }), undefined)
  assert.equal(mounted.guard({ name: 'read', arguments: {} }), undefined)
  const refusal = mounted.guard({ name: 'read', arguments: {} })
  assert.match(refusal, /budget for this turn is 3 call\(s\)/)
})

test('a new turn starts with a fresh budget', () => {
  const mounted = mount(defaults())
  mounted.guard({ name: 'read', arguments: {} })
  assert.match(mounted.guard({ name: 'read', arguments: {} }), /Dispatch the work/)
  mounted.turn.value = 2
  assert.equal(mounted.guard({ name: 'read', arguments: {} }), undefined)
})

test('non-inspection tools are never counted or refused', () => {
  const mounted = mount(defaults())
  for (let index = 0; index < 10; index += 1) {
    assert.equal(mounted.guard({ name: 'ask_user_question', arguments: {} }), undefined)
    assert.equal(mounted.guard({ name: 'team_task_list', arguments: {} }), undefined)
  }
  assert.equal(mounted.guard({ name: 'read', arguments: {} }), undefined, 'the budget was not consumed')
})

test('the workflow can be switched off live and the guide disappears with it', () => {
  const config = defaults()
  const mounted = mount(config)
  const guide = mounted.sections.find((section) => section.name === 'agent-team-roles:lead-workflow')
  assert.ok(guide, 'the turn protocol section is installed')
  assert.match(guide.text(), /dispatch first, then verify/)
  config.leadWorkflowMode = 'off'
  assert.equal(guide.text(), '', 'the section empties when the protocol is off')
  for (let index = 0; index < 5; index += 1) {
    assert.equal(mounted.guard({ name: 'read', arguments: {} }), undefined)
  }
})

test('a zero pre-dispatch budget requires a dispatch before the first self-check', () => {
  const mounted = mount({ ...defaults(), leadPreDispatchBudget: 0 })
  assert.match(mounted.guard({ name: 'read', arguments: {} }), /Dispatch the work before investigating further/)
  assert.equal(mounted.guard({ name: 'team_task_create', arguments: {} }), undefined)
  assert.equal(mounted.guard({ name: 'read', arguments: {} }), undefined)
})
