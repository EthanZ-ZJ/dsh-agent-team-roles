import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const bundle = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const members = '/agent-team-roles/member-models'
const gates = '/agent-team-roles/gates/root'

// Render function components in place; keep hooks per mounted child, not per
// function. Switching pages must dispose effects and remount even at the same path.
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
      if (node.props.ref) node.props.ref.current = { focus() {}, getBoundingClientRect: () => ({ left: 20, top: 400 }) }
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

async function mount() {
  const view = renderer()
  const urls = [], commands = [], timers = [], composer = []
  let plugin, roleReads = 0, english, pulled = false
  const doc = { body: {}, addEventListener() {}, removeEventListener() {} }
  const clock = { setInterval: fn => timers.push(fn), setTimeout: fn => timers.push(fn), clearInterval() {}, clearTimeout() {} }
  const window = { ...clock, document: doc, innerHeight: 800, innerWidth: 1200, addEventListener() {}, removeEventListener() {}, __ModuleLoader__: {
    load({ factory }) { plugin = factory(name => name === 'react' ? view.React : { createPortal: node => node }) },
  } }
  vm.runInNewContext(bundle, { window, document: doc, ...clock, fetch: async url => {
    urls.push(url)
    const data = url === members ? { roots: [{ rootId: 'root', lead: { provider: 'test', model: pulled ? 'after-pull' : 'original', reasoningEffort: '' }, members: [] }] } : { gates: [], reason: 'gate list loaded' }
    return { ok: true, json: async () => data }
  } })
  plugin.apply({
    effect: run => run(), locale: { bind: () => key => english[key], register: (_, dict) => { english = dict.en } },
    slots: { inject: (_, run) => run(), register: ({ name }, component) => { if (name === 'conversation.input.left') composer.push(component) } },
    remote: {
      settings: { describe: async () => { roleReads++; return { ok: true, value: { namespaces: [{ ns: 'agent-team-roles', value: { roles: [{ id: 'dev', name: 'Developer' }] } }] } } } },
      commands: { execute: async (sessionId, line) => { commands.push([sessionId, line]); pulled = true; return { ok: true, value: { result: { kind: 'text' } } } } },
    },
  })
  assert.equal(composer.length, 1, 'one team composer entry')
  const props = { sessionId: 'root', useSessions: select => select({ byId: { root: { projectionValues: { agentPreset: 'team-lead' } } } }) }
  const settle = () => view.settle(composer[0], props)
  await settle()
  const buttons = () => view.nodes.filter(node => node.type === 'button')
  const text = node => typeof node === 'object' ? (node?.children ?? []).map(text).join('') : String(node ?? '')
  async function click(matcher) {
    const matches = buttons().filter(node => [text(node), node.props['aria-label'], node.props.title].some(value => value && matcher.test(value)))
    assert.equal(matches.length, 1, `expected one button matching ${matcher}, got ${buttons().map(text)}`)
    assert.ok(!matches[0].props.disabled)
    await matches[0].props.onClick({ currentTarget: { getBoundingClientRect: () => ({ left: 20, top: 400, bottom: 430, right: 50 }) }, stopPropagation() {} })
    await settle()
  }
  return { view, urls, commands, timers, roleReads: () => roleReads, buttons, click, text: () => view.nodes.map(text).join(' ') }
}

test('single composer trigger opens members directly; gates load only when selected or refreshed', async () => {
  const panel = await mount()
  assert.equal(panel.buttons().length, 1)
  assert.deepEqual(panel.urls, [])
  await panel.click(/team/i)
  assert.deepEqual(panel.urls, [members])
  assert.match(panel.text(), /test\/original/)
  await panel.click(/^gates$/i)
  assert.match(panel.text(), /gate list loaded/)
  assert.deepEqual(panel.urls, [members, gates])
  await panel.click(/refresh/i)
  assert.deepEqual(panel.urls, [members, gates, gates])
  assert.equal(panel.roleReads(), 0)
  assert.equal(panel.timers.length, 0, 'idle pages must not schedule polling')
})

test('pull selects a preset inline, then returns to freshly loaded members', async () => {
  const panel = await mount()
  await panel.click(/team/i)
  await panel.click(/pull.*member/i)
  assert.equal(panel.roleReads(), 1)
  assert.equal(panel.view.nodes.filter(node => node.props.role === 'dialog').length, 1, 'pull stays within the team dialog')
  assert.match(panel.text(), /Developer/)
  assert.doesNotMatch(panel.text(), /test\/original/)
  await panel.click(/^pull(?: developer)?$/i)
  assert.deepEqual(panel.commands, [['root', '/team-spawn dev']])
  assert.deepEqual(panel.urls, [members, members])
  assert.match(panel.text(), /test\/after-pull/)
  assert.doesNotMatch(panel.text(), /Developer/)
  assert.equal(panel.timers.length, 0)
})
