import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const bundle = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** Minimal hook runtime plus in-place function-component rendering. */
function renderer() {
  const instances = new Map()
  let current, index, effects, visited, nodes
  let dirty = true
  const hook = () => current[index++] ??= {}
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))
  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) {
      const slot = hook()
      if (!('value' in slot)) slot.value = typeof initial === 'function' ? initial() : initial
      return [slot.value, next => {
        const value = typeof next === 'function' ? next(slot.value) : next
        if (!Object.is(value, slot.value)) { slot.value = value; dirty = true }
      }]
    },
    useRef(initial) { return hook().ref ??= { current: initial } },
    useEffect(run, deps) {
      const slot = hook()
      if (changed(slot.deps, deps)) {
        slot.deps = deps
        effects.push(() => { slot.cleanup?.(); slot.cleanup = run() })
      }
    },
  }
  const cleanup = slots => slots.forEach(slot => slot.cleanup?.())
  function render(node, path) {
    if (typeof node !== 'object' || node === null) return
    if (typeof node.type === 'function') {
      let instance = instances.get(path)
      if (instance?.type !== node.type) {
        if (instance) cleanup(instance.slots)
        instance = { type: node.type, slots: [] }
        instances.set(path, instance)
      }
      visited.add(path)
      current = instance.slots; index = 0
      render(node.type(node.props), path + '/render')
    } else {
      nodes.push(node)
      node.children.forEach((child, i) => render(child, path + '/' + (child?.props?.key ?? i)))
    }
  }
  return {
    React,
    get nodes() { return nodes },
    async settle(component, props) {
      for (let n = 0; n < 20; n++) {
        dirty = false; nodes = []; effects = []; visited = new Set()
        render(React.createElement(component, props), 'root')
        for (const [path, instance] of instances) if (!visited.has(path)) {
          cleanup(instance.slots); instances.delete(path)
        }
        effects.forEach(effect => effect())
        await new Promise(resolve => setImmediate(resolve))
        if (!dirty) return
      }
      assert.fail('panel did not settle')
    },
  }
}

function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return (node.children ?? []).map(textOf).join('')
}

async function mount() {
  const view = renderer()
  const tabTypes = []
  const bodies = []
  const openTabs = []
  const composers = []
  let english = {}
  let plugin
  const slots = {
    inject: (_owner, run) => run(),
    register: (definition, component) => {
      if (definition.name === 'conversation.input.left') composers.push(component)
      if (definition.name === 'sidebar.right.pane.tab') bodies.push({ definition, component })
      return () => {}
    },
  }
  const ctx = {
    effect: run => run(),
    locale: { bind: () => key => english[key] ?? key, register: (_ns, dict) => { english = dict.en } },
    slots,
    remote: { settings: { describe: async () => ({ ok: true, value: { namespaces: [] } }) }, commands: { execute: async () => ({ ok: true, value: { result: { kind: 'text' } } }) } },
    sessions: { refreshProjections: async () => {} },
    inject: (deps, run) => {
      run({
        slots,
        sidebarRightTabs: { register: definition => { tabTypes.push(definition); return () => {} } },
      })
      return { dispose: () => {} }
    },
    sidebarRight: { openTab: kind => openTabs.push(kind), mounted: { getSnapshot: () => 'root' } },
  }
  const window = {
    setInterval: () => 0, setTimeout: () => 0, clearInterval() {}, clearTimeout() {},
    innerHeight: 800, innerWidth: 1200, addEventListener() {}, removeEventListener() {},
    __ModuleLoader__: {
      load({ factory }) { plugin = factory(name => name === 'react' ? view.React : { createPortal: node => node }) },
    },
  }
  const doc = { body: {}, addEventListener() {}, removeEventListener() {} }
  vm.runInNewContext(bundle, { window, document: doc })
  plugin.apply(ctx)
  return { view, plugin, tabTypes, bodies, openTabs, composers, ctx, english: () => english }
}

const statusView = {
  goal: 'Ship the review panel',
  summary: 'Wired the panel and its tests.',
  next: 'Review the rollout options.',
  updatedAt: 1700000000000,
  updatedTurn: 4,
  currentTurn: 4,
  running: true,
}

const decisionRow = {
  callId: 'call-1',
  state: 'open',
  questions: [{
    id: 'rollout',
    question: 'How should we roll this out?',
    options: [
      { label: 'All users', description: 'Pro: Fast feedback.\nCon: Wider blast radius.' },
      { label: 'Small group', description: '优点：风险更低。\n代价：反馈更慢。' },
    ],
  }],
}

function bodyProps(overrides = {}) {
  const values = { agentTeamLeadStatus: statusView, agentPreset: 'team-lead', userQuestions: { active: [], settled: [] }, inbox: {}, goal: null }
  return {
    sessionId: 'root',
    useProjection: (key, selector) => selector(values[key]),
    useSessions: selector => selector({ byId: { root: { running: true } } }),
    useSessionStatus: selector => selector(new Map([['root', { pendingInteraction: overrides.carrier }]])),
    useAccess: () => true,
    ...overrides.props,
  }
}

test('the bundle registers a Lead-status tab type and its body seat', async () => {
  const panel = await mount()
  assert.equal(panel.tabTypes.length, 1)
  assert.equal(panel.tabTypes[0].id, 'dsh-agent-team-roles/team-lead-status')
  assert.equal(panel.tabTypes[0].kind, 'team-lead-status')
  assert.equal(panel.tabTypes[0].title(), 'Lead status')
  assert.equal(panel.bodies.length, 1)
  assert.equal(panel.bodies[0].definition.key, 'dsh-agent-team-roles/team-lead-status')
})

test('the launcher renders only for Team Lead sessions and opens the tab', async () => {
  const panel = await mount()
  assert.equal(panel.composers.length, 1)
  const props = { sessionId: 'root', useSessions: select => select({ byId: { root: { projectionValues: { agentPreset: 'team-lead' } } } }) }
  await panel.view.settle(panel.composers[0], props)
  const launcher = panel.view.nodes.find(node => node.type === 'button' && textOf(node) === 'Lead status')
  assert.ok(launcher, 'Lead status launcher is rendered')
  await launcher.props.onClick({})
  assert.deepEqual(panel.openTabs, ['team-lead-status'])
  const standard = { sessionId: 'root', useSessions: select => select({ byId: { root: { projectionValues: { agentPreset: 'standard' } } } }) }
  await panel.view.settle(panel.composers[0], standard)
  assert.equal(panel.view.nodes.some(node => textOf(node) === 'Lead status'), false)
})

test('the panel shows the current goal and progress', async () => {
  const panel = await mount()
  const Body = panel.bodies[0].component
  await panel.view.settle(Body, bodyProps())
  const text = panel.view.nodes.map(textOf).join(' ')
  assert.match(text, /Ship the review panel/)
  assert.match(text, /Wired the panel and its tests\./)
  assert.match(text, /Review the rollout options\./)
  assert.match(text, /Updated this turn/)
  assert.match(text, /No decisions are waiting\./)
})

test('a decision keeps its tradeoff and sends the reviewed batch through the native carrier', async () => {
  const panel = await mount()
  const Body = panel.bodies[0].component
  const answered = []
  const carrier = {
    kind: 'question',
    sessionId: 'root',
    callId: 'call-1',
    snapshot: () => ({ state: 'open', waitState: 'counting', channel: 'waterfall', closed: false }),
    answer: async batch => { answered.push(batch) },
  }
  const props = bodyProps({ carrier })
  props.useProjection = (key, selector) => selector(key === 'userQuestions' ? { active: [decisionRow], settled: [] } : { goal: null, agentPreset: 'team-lead', inbox: {} }[key])
  await panel.view.settle(Body, props)
  let text = panel.view.nodes.map(textOf).join(' ')
  assert.match(text, /How should we roll this out\?/)
  assert.match(text, /All users/)
  assert.match(text, /Fast feedback\./)
  assert.match(text, /Wider blast radius\./)
  assert.match(text, /风险更低/)

  const button = matcher => panel.view.nodes.find(node => node.type === 'button' && matcher.test(textOf(node)))
  const option = button(/All users/)
  await option.props.onClick({})
  await panel.view.settle(Body, props)
  const review = button(/Review answers/)
  assert.equal(review.props.disabled, false)
  await review.props.onClick({})
  await panel.view.settle(Body, props)
  const confirm = button(/Confirm and send/)
  assert.ok(confirm, 'confirm step is shown')
  await confirm.props.onClick({})
  await panel.view.settle(Body, props)
  assert.deepEqual(JSON.parse(JSON.stringify(answered)), [{ answers: [{ id: 'rollout', selected: ['All users'] }] }])
  text = panel.view.nodes.map(textOf).join(' ')
  assert.match(text, /Answer sent/)
})

test('an explicit skip and a custom answer reach the carrier unchanged', async () => {
  const panel = await mount()
  const Body = panel.bodies[0].component
  const answered = []
  const carrier = {
    kind: 'question',
    sessionId: 'root',
    callId: 'call-1',
    snapshot: () => ({ state: 'open', waitState: 'counting', channel: 'waterfall', closed: false }),
    answer: async batch => { answered.push(batch) },
  }
  const props = bodyProps({ carrier })
  props.useProjection = (key, selector) => selector(key === 'userQuestions' ? { active: [decisionRow], settled: [] } : { goal: null, agentPreset: 'team-lead', inbox: {} }[key])
  await panel.view.settle(Body, props)
  const button = matcher => panel.view.nodes.find(node => node.type === 'button' && matcher.test(textOf(node)))
  await button(/Skip this question/).props.onClick({})
  await panel.view.settle(Body, props)
  await button(/Review answers/).props.onClick({})
  await panel.view.settle(Body, props)
  await button(/Confirm and send/).props.onClick({})
  await panel.view.settle(Body, props)
  assert.deepEqual(JSON.parse(JSON.stringify(answered)), [{ answers: [{ id: 'rollout', selected: [] }] }])
})

test('a continued question answers through the Remote and reports stale state', async () => {
  const panel = await mount()
  const Body = panel.bodies[0].component
  const calls = []
  let result = true
  panel.ctx.remote.userQuestions = {
    answer: async (...args) => { calls.push(args); return result ? { ok: true, value: true } : { ok: true, value: false } },
  }
  const props = bodyProps({ carrier: undefined })
  props.useProjection = (key, selector) => selector(key === 'userQuestions' ? { active: [{ ...decisionRow, state: 'continued' }], settled: [] } : { goal: null, agentPreset: 'team-lead', inbox: {} }[key])
  await panel.view.settle(Body, props)
  const button = matcher => panel.view.nodes.find(node => node.type === 'button' && matcher.test(textOf(node)))
  await button(/Small group/).props.onClick({})
  await panel.view.settle(Body, props)
  await button(/Review answers/).props.onClick({})
  await panel.view.settle(Body, props)
  await button(/Confirm and send follow-up/).props.onClick({})
  await panel.view.settle(Body, props)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'root')
  assert.equal(calls[0][1], 'call-1')
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])), { answers: [{ id: 'rollout', selected: ['Small group'] }] })

  result = false
  await panel.view.settle(Body, props)
  await button(/Small group/).props.onClick({})
  await panel.view.settle(Body, props)
  await button(/Review answers/).props.onClick({})
  await panel.view.settle(Body, props)
  await button(/Confirm and send follow-up/).props.onClick({})
  await panel.view.settle(Body, props)
  assert.equal(calls.length, 2)
  assert.match(panel.view.nodes.map(textOf).join(' '), /no longer take this answer/)
})

test('an incomplete batch cannot be reviewed or confirmed', async () => {
  const panel = await mount()
  const Body = panel.bodies[0].component
  const props = bodyProps({ carrier: undefined })
  props.useProjection = (key, selector) => selector(key === 'userQuestions' ? { active: [decisionRow], settled: [] } : { goal: null, agentPreset: 'team-lead', inbox: {} }[key])
  await panel.view.settle(Body, props)
  const review = panel.view.nodes.find(node => node.type === 'button' && textOf(node) === 'Review answers')
  assert.equal(review.props.disabled, true)
})
