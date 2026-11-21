import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const bundle = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const members = '/agent-team-roles/member-models'
const catalog = '/agent-team-roles/model-catalog'
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

async function mount(options = {}) {
  const roster = options.members ?? []
  const view = renderer()
  const urls = [], commands = [], timers = [], composer = []
  let plugin, roleReads = 0, english, pulled = false
  const doc = { body: {}, addEventListener() {}, removeEventListener() {} }
  const clock = { setInterval: fn => timers.push(fn), setTimeout: fn => timers.push(fn), clearInterval() {}, clearTimeout() {} }
  const window = { ...clock, document: doc, innerHeight: 800, innerWidth: 1200, addEventListener() {}, removeEventListener() {}, __ModuleLoader__: {
    load({ factory }) { plugin = factory(name => name === 'react' ? view.React : { createPortal: node => node }) },
  } }
  vm.runInNewContext(bundle, { window, document: doc, ...clock, fetch: async (url, options = {}) => {
    urls.push(url)
    const method = options.method ?? 'GET'
    if (url === '/agent-team-roles/apply-settings') {
      assert.equal(method, 'POST')
      return { ok: true, json: async () => ({ members: [{ member: 'dev', role: 'dev', applied: ['model'] }] }) }
    }
    if (url.startsWith('/agent-team-roles/settings-log')) {
      return { ok: true, json: async () => ({ entries: [
        { at: 1700000000000, actor: 'settings', changes: [{ roleId: 'dev', fields: [{ field: 'model', from: 'a', to: 'b' }] }] },
      ] }) }
    }
    if (url === '/agent-team-roles/model-catalog') {
      return { ok: true, json: async () => ({ routes: [
        { provider: 'zai', id: 'glm-5.3-flash', name: 'GLM' },
        { provider: 'deepseek-official', id: 'deepseek-flash', name: 'DeepSeek' },
      ], efforts: [{ id: 'low', name: 'low' }, { id: 'high', name: 'high' }] }) }
    }
    if (url === '/agent-team-roles/member-model') {
      assert.equal(method, 'POST')
      const body = JSON.parse(options.body)
      assert.equal(body.rootId, 'root')
      return { ok: true, json: async () => ({ ...body, roleId: 'dev', live: true }) }
    }
    const data = url === members ? { roots: [{ rootId: 'root', lead: { provider: 'test', model: pulled ? 'after-pull' : 'original', reasoningEffort: '' }, members: roster }] } : { gates: [], reason: 'gate list loaded' }
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
  return { view, urls, commands, timers, roleReads: () => roleReads, buttons, click, text: () => view.nodes.map(text).join(' '), composer: composer[0], props }
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
  await panel.click(/apply settings/i)
  assert.deepEqual(panel.urls, [members, gates, '/agent-team-roles/apply-settings', gates],
    'applying settings re-reads the gates view for this session')
  assert.match(panel.text(), /Applied to 1 members \(busy \+ idle\)/)
  assert.equal(panel.roleReads(), 0)
  assert.equal(panel.timers.length, 0, 'idle pages must not schedule polling')
})

test('the members page switches one member model for this Team only', async () => {
  const panel = await mount({ members: [{
    name: 'dev', roleId: 'dev', roleName: 'DEV', status: 'inactive',
    provider: 'zai', model: 'glm-5.3-flash', reasoningEffort: 'high', source: 'primary', pending: true,
    routes: [
      { provider: 'zai', model: 'glm-5.3-flash', reasoningEffort: 'high', kind: 'primary', index: -1 },
      { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: '', kind: 'fallback', index: 0 },
    ],
  }] })
  await panel.click(/team/i)
  assert.match(panel.text(), /test\/original/)
  await panel.click(/switch model/i)
  const selects = panel.view.nodes.filter(node => node.type === 'select')
  const picker = selects.find(node => node.props['aria-label'] === 'Choose a configured model')
  assert.ok(picker, 'the picker renders inside the member row')
  assert.deepEqual(picker.children.filter(child => child.type === 'option').map(option => option.props.value), ['0', '1'],
    'only the role primary and its fallbacks are offered')
  assert.equal(picker.props.value, '0', 'opening the picker preselects the route in use')
  assert.match(panel.text(), /primary · zai\/glm-5\.3-flash/)
  assert.match(panel.text(), /fallback 1 · deepseek-official\/deepseek-flash/)
  picker.props.onChange({ target: { value: '1' } })
  await panel.view.settle(panel.composer, panel.props)
  await panel.click(/^apply$/i)
  assert.ok(panel.urls.includes('/agent-team-roles/member-model'))
  assert.match(panel.text(), /Switched dev → deepseek-official\/deepseek-flash/)
})

test('the model picker preselects the primary route when the current model is not in the role routes', async () => {
  const panel = await mount({ members: [{
    name: 'dev', roleId: 'dev', roleName: 'DEV', status: 'inactive',
    provider: 'outside', model: 'unlisted', reasoningEffort: '', source: 'manual', pending: false,
    routes: [
      { provider: 'zai', model: 'glm-5.3-flash', reasoningEffort: 'high', kind: 'primary', index: -1 },
      { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: '', kind: 'fallback', index: 0 },
    ],
  }] })
  await panel.click(/team/i)
  await panel.click(/switch model/i)
  const picker = panel.view.nodes.find(node => node.type === 'select' && node.props['aria-label'] === 'Choose a configured model')
  assert.ok(picker, 'the picker renders inside the member row')
  assert.equal(picker.props.value, '0', 'a current model outside the role routes falls back to the primary route')
})

test('pull selects presets inline and stays open for consecutive pulls', async () => {
  const panel = await mount()
  await panel.click(/team/i)
  await panel.click(/pull.*member/i)
  assert.equal(panel.roleReads(), 1)
  assert.equal(panel.view.nodes.filter(node => node.props.role === 'dialog').length, 1, 'pull stays within the team dialog')
  assert.match(panel.text(), /Developer/)
  await panel.click(/^pull(?: developer)?$/i)
  assert.deepEqual(panel.commands, [['root', '/team-spawn dev']])
  assert.deepEqual(panel.urls, [members], 'no extra fetches while the pull page stays open')
  assert.match(panel.text(), /Pulled/, 'a success notice confirms the pull without navigating')
  assert.match(panel.text(), /Developer/, 'the role list stays visible for the next pull')
  await panel.click(/^pull(?: developer)?$/i)
  assert.equal(panel.commands.length, 2, 'consecutive pulls run without leaving the page')
  assert.equal(panel.timers.length, 0)
})
