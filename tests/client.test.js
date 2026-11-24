/**
 * Headless client checks.
 *
 * `client.js` is a browser bundle, but its factory is a plain function: this
 * file loads it with a tiny React-hook runtime and a fake settings Remote. That
 * makes settings and manual gate behavior
 * unit-testable without a DOM or the running GUI.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const clientSrc = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')

const NS = 'agent-team-roles'

// ---------------------------------------------------------------------------
// Source extraction helpers (the bundle exposes no ESM exports)
// ---------------------------------------------------------------------------

/** Read one top-level function body with balanced braces. */
function extractFunction(name) {
  let start = clientSrc.indexOf(`function ${name}(`)
  if (start < 0) return undefined
  if (clientSrc.slice(Math.max(0, start - 6), start) === 'async ') start -= 6
  let depth = 0
  let quote = null
  let lineComment = false
  let blockComment = false
  for (let index = clientSrc.indexOf('{', start); index < clientSrc.length; index += 1) {
    const char = clientSrc[index]
    const next = clientSrc[index + 1]
    if (lineComment) {
      if (char === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (quote !== null) {
      if (char === '\\') {
        index += 1
        continue
      }
      if (char === quote) quote = null
      continue
    }
    if (char === '/' && next === '/') {
      lineComment = true
      index += 1
      continue
    }
    if (char === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return clientSrc.slice(start, index + 1)
    }
  }
  return undefined
}

/** Extract the factory body and instantiate it with a React stub. */
function loadClientFactory(react) {
  const marker = clientSrc.indexOf('factory(require) {')
  assert.ok(marker >= 0, 'client.js must keep the __ModuleLoader__ factory')
  const bodyStart = clientSrc.indexOf('{', marker) + 1
  // The bundle ends with `  },\n})`; the last `  },` closes the factory.
  const footer = /\n  \},\n\}\)\s*$/.exec(clientSrc)
  assert.ok(footer, 'client.js must end with the module loader footer')
  const bodyEnd = footer.index + 3
  assert.ok(bodyEnd > bodyStart, 'factory body must be closed')
  const factory = new Function('require', clientSrc.slice(bodyStart, bodyEnd))
  return factory((name) => {
    assert.equal(name, 'react', 'the client bundle only requires react')
    return react
  })
}

// ---------------------------------------------------------------------------
// A minimal React hook runtime (only the five APIs client.js uses)
// ---------------------------------------------------------------------------

function sameDeps(left, right) {
  if (left === right) return true
  if (!Array.isArray(left) || !Array.isArray(right)) return false
  if (left.length !== right.length) return false
  return left.every((value, index) => Object.is(value, right[index]))
}

function createReactHarness() {
  const instances = new Map()
  let current = null
  let cursor = 0
  let dirty = false
  let pendingEffects = []

  const react = {
    Fragment: Symbol.for('react.fragment'),
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity) }
    },
    useState(initial) {
      const index = cursor
      cursor += 1
      const slot = current.hooks[index] ?? (current.hooks[index] = {
        value: typeof initial === 'function' ? initial() : initial,
      })
      const setState = (next) => {
        const value = typeof next === 'function' ? next(slot.value) : next
        if (!Object.is(value, slot.value)) {
          slot.value = value
          dirty = true
        }
      }
      return [slot.value, setState]
    },
    useRef(initial) {
      const index = cursor
      cursor += 1
      if (current.hooks[index] === undefined) current.hooks[index] = { current: initial }
      return current.hooks[index]
    },
    useCallback(fn) {
      cursor += 1
      return fn
    },
    useMemo(fn) {
      cursor += 1
      return fn()
    },
    useEffect(fn, deps) {
      const index = cursor
      cursor += 1
      const slot = current.hooks[index] ?? (current.hooks[index] = {
        kind: 'effect',
        initialized: false,
        deps: undefined,
      })
      const changed = !slot.initialized || deps === undefined || !sameDeps(slot.deps, deps)
      if (changed) {
        slot.initialized = true
        slot.deps = deps
        pendingEffects.push(fn)
      }
    },
  }

  async function flush(count = 24) {
    for (let index = 0; index < count; index += 1) await Promise.resolve()
  }

  /**
   * Render one component instance to a plain element tree, running effects and
   * settling state updates. The same component can be rendered again to apply
   * user-event state changes (a stand-in for a re-render).
   */
  async function render(Component, props = {}) {
    if (!instances.has(Component)) instances.set(Component, { hooks: [] })
    current = instances.get(Component)
    for (let pass = 0; pass < 30; pass += 1) {
      cursor = 0
      dirty = false
      pendingEffects = []
      const tree = Component(props)
      for (const effect of pendingEffects) {
        const result = effect()
        if (result !== undefined && typeof result.then === 'function') await result
      }
      for (let tick = 0; tick < 24 && dirty === false; tick += 1) await Promise.resolve()
      if (dirty === false) return tree
    }
    assert.fail('component did not settle')
  }

  return { react, render }
}

function walk(tree, visit) {
  if (tree === null || tree === undefined || typeof tree === 'boolean') return
  if (typeof tree === 'string' || typeof tree === 'number') return
  if (Array.isArray(tree)) {
    for (const child of tree) walk(child, visit)
    return
  }
  if (typeof tree === 'object' && 'type' in tree) visit(tree)
  for (const child of tree.children ?? []) walk(child, visit)
}

function textOf(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree)
  if (Array.isArray(tree)) return tree.map(textOf).join('')
  return (tree?.children ?? []).map(textOf).join('')
}

function findAll(tree, predicate) {
  const found = []
  walk(tree, (element) => {
    if (predicate(element)) found.push(element)
  })
  return found
}

function findOne(tree, predicate, message) {
  const [first] = findAll(tree, predicate)
  assert.ok(first, message)
  return first
}

function findButton(tree, label) {
  return findOne(
    tree,
    (element) => element.type === 'button' && textOf(element) === label,
    `button "${label}" must be rendered`,
  )
}

function findComponent(tree, name) {
  return findOne(tree, (element) => element.type?.name === name, `${name} must be in the tree`)
}

// ---------------------------------------------------------------------------
// Fake settings Remote + module bootstrap
// ---------------------------------------------------------------------------

const VALID_GATE = {
  id: 'manual-gate',
  deny: { role: 'general', tool: ['bash', 'pwsh'] },
  require: { event: 'manual-check', byRoles: ['general'], freshFor: 60 },
  description: 'manual path gate',
}

const VALID_GATE_2 = {
  id: 'manual-gate-2',
  deny: { role: 'general', tool: ['write'] },
  require: { event: 'manual-check-2', byRoles: ['general'] },
  description: 'second manual gate',
}

/** A structurally invalid legacy gate a user could have hand-edited into Config. */
const LEGACY_INVALID_GATE = {
  id: 'legacy-broken',
  deny: { role: '', tool: ['bash'] },
  require: { event: 'legacy-event', byRoles: ['general'] },
  description: 'legacy invalid gate',
}

function namespaceView(value, revision = 3, writable = true) {
  return {
    ok: true,
    value: {
      writable,
      namespaces: [{ ns: NS, revision, value }],
    },
  }
}

function createClientContext({ describe, mutate, session }) {
  const registrations = []
  const state = { describeCalls: 0, mutateCalls: [], eventHandlers: [] }
  const ctx = {
    locale: {
      bind: () => (key) => key,
      register: () => () => {},
    },
    slots: {
      inject: (name, install) => install(),
      register: (descriptor, component) => {
        registrations.push({ descriptor, component })
        return () => {}
      },
    },
    effect: (install) => {
      install()
      return () => {}
    },
    remote: {
      session,
      settings: {
        describe: async () => {
          state.describeCalls += 1
          return describe()
        },
        mutate: async (...args) => {
          state.mutateCalls.push(args)
          return mutate(...args)
        },
      },
      $on: (name, handler) => {
        state.eventHandlers.push({ name, handler })
        return () => {}
      },
    },
    sessions: {},
  }
  return { ctx, registrations, state }
}

async function mountSection(harness, remoteOptions) {
  const module = loadClientFactory(harness.react)
  const environment = createClientContext(remoteOptions)
  module.apply(environment.ctx)
  const page = environment.registrations
    .find(({ descriptor }) => descriptor?.name === 'settings.section')?.component
  assert.equal(typeof page, 'function', 'settings.section must be registered')
  const tree = await harness.render(page)
  return { ...environment, tree, page, harness }
}

/** View objects shared by settings scenarios. */
function baseValue(overrides = {}) {
  return {
    roles: [{ id: 'general', name: 'General', description: '' }],
    rules: [],
    gates: [],
    gatesDisabled: [],
    leadPlaybook: '',
    activeTemplate: '',
    freshProvider: 'spawn',
    forkProvider: 'fork',
    ...overrides,
  }
}

async function openEngineTab(mounted) {
  findButton(mounted.tree, 'engine').props.onClick()
  const tree = await mounted.harness.render(mounted.page)
  const engine = findComponent(tree, 'EnginePanel')
  const panel = await mounted.harness.render(engine.type, engine.props)
  return { tree, engine, panel }
}

test('the rules tab lists the lead bucket last so a new rule still targets a role', async () => {
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(baseValue({
      roles: [
        { id: 'general', name: 'General', description: '' },
        { id: 'dev', name: 'DEV', description: '' },
      ],
    }), 3),
    mutate: () => namespaceView(baseValue(), 4),
  })
  findButton(mounted.tree, 'rules').props.onClick()
  const tree = await mounted.harness.render(mounted.page)
  const panel = findComponent(tree, 'RulesPanel')
  assert.deepEqual(panel.props.roles.map((role) => role.id), ['general', 'dev', 'lead'])
  const rendered = await mounted.harness.render(panel.type, panel.props)
  const selects = findAll(rendered, (element) => element.type === 'select')
  const roleOptions = selects.map((select) => (select.children ?? [])
    .filter((child) => child.type === 'option')
    .map((option) => option.props?.value))
  assert.ok(roleOptions.some((values) => values.includes('lead')), 'the lead bucket is selectable')
  const draft = roleOptions.find((values) => values.includes('general') && values.includes('lead') && !values.includes(''))
  assert.equal(draft?.[0], 'general', 'a new rule defaults to a real role, not the lead bucket')
})

test('the settings page has a change-log tab that lists recorded diffs', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url.startsWith('/agent-team-roles/settings-log')) {
      return { ok: true, json: async () => ({ entries: [
        { at: 1700000000000, actor: 'settings-ui', changes: [{ roleId: 'dev', fields: [{ field: 'model', from: 'a', to: 'b' }] }] },
        { at: 1700000001000, actor: 'team-template apply: software-dev', changes: [{ roleId: 'pm', added: true, fields: [] }] },
      ] }) }
    }
    return { ok: true, json: async () => ({ routes: [] }) }
  })
  const harness = createReactHarness()
  const mounted = await mountSection(harness, { describe: () => namespaceView(baseValue(), 3), mutate: () => namespaceView(baseValue(), 4) })
  findButton(mounted.tree, 'logTab').props.onClick()
  const tree = await mounted.harness.render(mounted.page)
  const panel = findComponent(tree, 'SettingsLogPanel')
  const rendered = await mounted.harness.render(panel.type, panel.props)
  const text = textOf(rendered)
  assert.match(text, /settings-ui/)
  assert.match(text, /dev: model/)
  assert.match(text, /pm: logAdded/)
  assert.match(text, /team-template apply: software-dev/)
})

// ---------------------------------------------------------------------------
// cr #11: revision refresh and conflict-code recognition
// ---------------------------------------------------------------------------

test('manually adding and editing a gate stays local until engine save', async () => {
  let hostValue = baseValue({ gates: [VALID_GATE] })
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(hostValue, 5),
    mutate: () => {
      const ops = mounted.state.mutateCalls.at(-1)[1]
      hostValue = { ...hostValue, gates: ops.find((op) => op.path[0] === 'gates').value }
      return namespaceView(hostValue, 6)
    },
  })
  await openEngineTab(mounted)

  const renderGates = async () => {
    const { panel } = await renderEngine(mounted)
    const gates = findComponent(panel, 'GatesPanel')
    return harness.render(gates.type, gates.props)
  }
  const renderForm = async () => {
    const form = findComponent(await renderGates(), 'GateForm')
    return harness.render(form.type, form.props)
  }
  const setField = async (key, value) => {
    const label = findOne(await renderForm(), (element) => element.type === 'label' && element.props?.key === key)
    findOne(label, (element) => element.type === 'input').props.onChange({ target: { value } })
  }

  const list = await renderGates()
  assert.deepEqual(findAll(list, (element) => element.type === 'button').map(textOf), ['gateAdd'])
  findButton(list, 'gateAdd').props.onClick()
  await setField('id', VALID_GATE_2.id)
  await setField('denyRole', VALID_GATE_2.deny.role)
  await setField('denyTools', VALID_GATE_2.deny.tool.join(', '))
  await setField('event', VALID_GATE_2.require.event)
  await setField('byRoles', VALID_GATE_2.require.byRoles.join(', '))
  findButton(await renderForm(), 'gateFormSave').props.onClick()

  const card = findOne(await renderGates(), (element) => element.props?.gate?.id === VALID_GATE_2.id)
  const cardTree = await harness.render(card.type, card.props)
  findButton(cardTree, 'gateEdit').props.onClick()
  await setField('desc', VALID_GATE_2.description)
  findButton(await renderForm(), 'gateFormSave').props.onClick()
  assert.equal(mounted.state.mutateCalls.length, 0)

  const { panel } = await renderEngine(mounted)
  await findButton(await mounted.harness.render(mounted.page), 'save').props.onClick()
  assert.equal(mounted.state.mutateCalls.length, 1)
  const ops = mounted.state.mutateCalls[0][1]
  assert.deepEqual(ops.map((op) => op.path[0]), ['leadPlaybook', 'leadWorkflowMode', 'leadSelfWorkBudget', 'leadPreDispatchBudget', 'routerMode', 'routerProvider', 'routerModel', 'routerReasoningEffort', 'routerTimeoutMs', 'routerMaxTokens', 'routerRequireDecision', 'leadToolMode', 'leadToolDeny', 'activeTemplate', 'freshProvider', 'forkProvider', 'gates', 'gatesDisabled'])
  const modeOp = ops.find((op) => op.path[0] === 'leadToolMode')
  assert.equal(modeOp.value, 'hide', 'the Lead tool policy defaults to hiding implementation tools')
  const denyOp = ops.find((op) => op.path[0] === 'leadToolDeny')
  assert.deepEqual(denyOp.value, [], 'the extra deny list starts empty and is written as an array')
  const modeSelect = findOne(panel, (element) => element.type === 'select' && element.props?.['aria-label'] === 'leadToolMode')
  assert.deepEqual(modeSelect.children.map((option) => option.props.value), ['hide', 'deny', 'off'])
  assert.equal(modeSelect.props.value, 'hide', 'the panel starts on the recommended policy')
  assert.ok(findOne(panel, (element) => element.type === 'input' && element.props?.['aria-label'] === 'leadToolDeny'), 'extra denied tools are editable')
  const workflowMode = findOne(panel, (element) => element.type === 'select' && element.props?.['aria-label'] === 'leadWorkflowMode')
  assert.deepEqual(workflowMode.children.map((option) => option.props.value), ['dispatch-first', 'off'])
  assert.equal(ops.find((op) => op.path[0] === 'leadWorkflowMode').value, 'dispatch-first')
  assert.equal(ops.find((op) => op.path[0] === 'leadSelfWorkBudget').value, 3)
  assert.equal(ops.find((op) => op.path[0] === 'leadPreDispatchBudget').value, 1)
  // Router decision model: every control is labeled and starts on the defaults.
  const routerModeSelect = findOne(panel, (element) => element.type === 'select' && element.props?.['aria-label'] === 'routerMode')
  assert.deepEqual(routerModeSelect.children.map((option) => option.props.value), ['model', 'rules', 'off'])
  assert.equal(routerModeSelect.props.value, 'model', 'routing starts on the model decision')
  for (const label of ['routerMode', 'routerProvider', 'routerModel', 'routerReasoningEffort', 'routerTimeoutMs', 'routerMaxTokens', 'routerRequireDecision']) {
    assert.ok(
      findOne(panel, (element) => (element.type === 'input' || element.type === 'select') && element.props?.['aria-label'] === label),
      `the router control "${label}" must be labeled`,
    )
  }
  assert.ok(findOne(panel, (element) => element.type === 'span' && textOf(element) === 'routerHint'), 'the router hint must be shown')
  const requireDecision = findOne(panel, (element) => element.type === 'input' && element.props?.['aria-label'] === 'routerRequireDecision')
  assert.equal(requireDecision.props.checked, true, 'a route decision is required by default')
  assert.equal(ops.find((op) => op.path[0] === 'routerMode').value, 'model')
  assert.equal(ops.find((op) => op.path[0] === 'routerProvider').value, '')
  assert.equal(ops.find((op) => op.path[0] === 'routerModel').value, '')
  assert.equal(ops.find((op) => op.path[0] === 'routerReasoningEffort').value, '')
  assert.equal(ops.find((op) => op.path[0] === 'routerTimeoutMs').value, 20000)
  assert.equal(typeof ops.find((op) => op.path[0] === 'routerTimeoutMs').value, 'number', 'the timeout is saved as a number')
  assert.equal(ops.find((op) => op.path[0] === 'routerMaxTokens').value, 800)
  assert.equal(typeof ops.find((op) => op.path[0] === 'routerMaxTokens').value, 'number', 'max tokens are saved as a number')
  assert.equal(ops.find((op) => op.path[0] === 'routerRequireDecision').value, true)
  assert.equal(typeof ops.find((op) => op.path[0] === 'routerRequireDecision').value, 'boolean', 'requireDecision is saved as a boolean')
  assert.deepEqual(hostValue.gates, [VALID_GATE, VALID_GATE_2])
})

test('the engine form adopts the host router settings and saves them unchanged', async () => {
  let hostValue = baseValue({
    routerMode: 'rules',
    routerProvider: 'openai-codex',
    routerModel: 'gpt-6.2-astra',
    routerReasoningEffort: 'high',
    routerTimeoutMs: 35000,
    routerMaxTokens: 1200,
    routerRequireDecision: false,
  })
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(hostValue, 7),
    mutate: () => {
      const ops = mounted.state.mutateCalls.at(-1)[1]
      for (const op of ops) hostValue = { ...hostValue, [op.path[0]]: op.value }
      return namespaceView(hostValue, 8)
    },
  })
  const { panel } = await openEngineTab(mounted)
  const routerMode = findOne(panel, (element) => element.type === 'select' && element.props?.['aria-label'] === 'routerMode')
  assert.equal(routerMode.props.value, 'rules')
  assert.equal(findOne(panel, (element) => element.type === 'input' && element.props?.['aria-label'] === 'routerProvider').props.value, 'openai-codex')
  assert.equal(findOne(panel, (element) => element.type === 'input' && element.props?.['aria-label'] === 'routerModel').props.value, 'gpt-6.2-astra')
  assert.equal(findOne(panel, (element) => element.type === 'input' && element.props?.['aria-label'] === 'routerTimeoutMs').props.value, 35000)
  assert.equal(findOne(panel, (element) => element.type === 'input' && element.props?.['aria-label'] === 'routerRequireDecision').props.checked, false)

  await findButton(await mounted.harness.render(mounted.page), 'save').props.onClick()
  const ops = mounted.state.mutateCalls[0][1]
  assert.equal(ops.find((op) => op.path[0] === 'routerMode').value, 'rules')
  assert.equal(ops.find((op) => op.path[0] === 'routerProvider').value, 'openai-codex')
  assert.equal(ops.find((op) => op.path[0] === 'routerModel').value, 'gpt-6.2-astra')
  assert.equal(ops.find((op) => op.path[0] === 'routerReasoningEffort').value, 'high')
  assert.equal(ops.find((op) => op.path[0] === 'routerTimeoutMs').value, 35000)
  assert.equal(ops.find((op) => op.path[0] === 'routerMaxTokens').value, 1200)
  assert.equal(ops.find((op) => op.path[0] === 'routerRequireDecision').value, false)
})

test('the engine form falls back to router defaults for invalid host values', async () => {
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(baseValue({
      routerMode: 'bogus',
      routerProvider: 42,
      routerModel: null,
      routerReasoningEffort: false,
      routerTimeoutMs: 0,
      routerMaxTokens: -5,
      routerRequireDecision: 'yes',
    }), 3),
    mutate: () => namespaceView(baseValue(), 4),
  })
  const { panel } = await openEngineTab(mounted)
  const routerMode = findOne(panel, (element) => element.type === 'select' && element.props?.['aria-label'] === 'routerMode')
  assert.equal(routerMode.props.value, 'model', 'an unknown mode falls back to the model decision')
  assert.equal(findOne(panel, (element) => element.type === 'input' && element.props?.['aria-label'] === 'routerProvider').props.value, '')
  assert.equal(findOne(panel, (element) => element.type === 'input' && element.props?.['aria-label'] === 'routerModel').props.value, '')
  assert.equal(findOne(panel, (element) => element.type === 'input' && element.props?.['aria-label'] === 'routerTimeoutMs').props.value, 20000)
  assert.equal(findOne(panel, (element) => element.type === 'input' && element.props?.['aria-label'] === 'routerMaxTokens').props.value, 800)
  assert.equal(findOne(panel, (element) => element.type === 'input' && element.props?.['aria-label'] === 'routerRequireDecision').props.checked, true)

  await findButton(await mounted.harness.render(mounted.page), 'save').props.onClick()
  const ops = mounted.state.mutateCalls[0][1]
  assert.equal(ops.find((op) => op.path[0] === 'routerTimeoutMs').value, 20000)
  assert.equal(ops.find((op) => op.path[0] === 'routerMaxTokens').value, 800)
  assert.equal(ops.find((op) => op.path[0] === 'routerRequireDecision').value, true)
})

test('writeNamespaceFields surfaces the settings error code (cr #11)', async () => {
  const source = extractFunction('writeNamespaceFields')
  assert.ok(source, 'client.js must keep writeNamespaceFields')
  const factory = new Function('readNamespace', 'NS', `${source}\nreturn writeNamespaceFields`)
  const write = factory(async () => ({ revision: 1, value: {} }), NS)
  const ctx = {
    remote: {
      settings: {
        mutate: async () => ({ ok: false, error: { code: 'conflict', message: 'revision conflict' } }),
      },
    },
  }
  await assert.rejects(
    () => write(ctx, 1, [{ field: 'gates', value: [] }]),
    (error) => {
      assert.equal(error.code, 'conflict', 'the settings error code must survive the wrapper')
      return true
    },
  )
})

test('every namespace mutation refreshes the revision (cr #11)', () => {
  const writes = [...clientSrc.matchAll(/await\s+writeNamespace(?:Fields)?\(/g)].map((match) => match.index)
  assert.ok(writes.length >= 3, `expected several mutate call sites, found ${writes.length}`)
  for (const at of writes) {
    const window = clientSrc.slice(at, at + 900)
    assert.match(window, /setRevision|refreshRevision/, 'a mutate must be followed by a revision refresh')
  }
})

// ---------------------------------------------------------------------------
// R1: a failed save keeps local edits instead of reloading over them
// ---------------------------------------------------------------------------

test('R1: a conflicting save keeps the local draft and refreshes the revision', async () => {
  const hostView = baseValue()
  let failWithConflict = false
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(hostView, failWithConflict ? 8 : 7),
    mutate: () => (failWithConflict
      ? { ok: false, error: { code: 'conflict', message: 'revision conflict' } }
      : namespaceView(hostView, 8)),
  })
  const { engine, panel } = await openEngineTab(mounted)

  // One local edit that is NOT saved yet (the host view stays unchanged).
  const playbook = findOne(
    panel,
    (element) => element.type === 'textarea' && element.props?.placeholder === 'playbookPlaceholder',
    'the engine playbook textarea must render',
  )
  playbook.props.onChange({ target: { value: 'local-draft' } })
  const afterEdit = await harness.render(mounted.page)
  const engineAfterEdit = findComponent(afterEdit, 'EnginePanel')
  const panelAfterEdit = await harness.render(engineAfterEdit.type, engineAfterEdit.props)
  const draftField = findOne(
    panelAfterEdit,
    (element) => element.type === 'textarea' && element.props?.placeholder === 'playbookPlaceholder',
  )
  assert.equal(draftField.props.value, 'local-draft', 'the local edit is applied')

  failWithConflict = true
  const describeBefore = mounted.state.describeCalls
  await findButton(await mounted.harness.render(mounted.page), 'save').props.onClick()
  const afterFailure = await harness.render(mounted.page)
  const engineAfterFailure = findComponent(afterFailure, 'EnginePanel')
  const panelAfterFailure = await harness.render(engineAfterFailure.type, engineAfterFailure.props)
  const keptField = findOne(
    panelAfterFailure,
    (element) => element.type === 'textarea' && element.props?.placeholder === 'playbookPlaceholder',
  )
  assert.equal(keptField.props.value, 'local-draft', 'R1: the failed save must not overwrite the local draft')
  assert.ok(mounted.state.describeCalls > describeBefore, 'the failure path re-reads the revision')
  assert.match(textOf(afterFailure), /saveFailed/, 'a retryable error is shown')
  assert.ok(engine)
})

// ---------------------------------------------------------------------------
// R4 / D9: save-set validation, gatesDisabled filtering, legacy tiers
// ---------------------------------------------------------------------------

async function renderEngine(mounted) {
  const tree = await mounted.harness.render(mounted.page)
  const engine = findComponent(tree, 'EnginePanel')
  const panel = await mounted.harness.render(engine.type, engine.props)
  return { tree, engine, panel }
}

test('saveEngine filters gatesDisabled down to existing gate ids (R4)', async () => {
  const harness = createReactHarness()
  const view = baseValue({ gates: [VALID_GATE], gatesDisabled: ['manual-gate', 'ghost-gate'] })
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(view, 3),
    mutate: () => namespaceView(baseValue({ gates: [VALID_GATE], gatesDisabled: ['manual-gate'] }), 4),
  })
  const { panel } = await openEngineTab(mounted)
  await findButton(await mounted.harness.render(mounted.page), 'save').props.onClick()
  assert.equal(mounted.state.mutateCalls.length, 1)
  const ops = mounted.state.mutateCalls[0][1]
  const disabled = ops.find((op) => op.path[0] === 'gatesDisabled')
  assert.ok(disabled, 'the save still writes gatesDisabled')
  assert.deepEqual(disabled.value, ['manual-gate'], 'dangling disabled ids are dropped, existing ids kept')
})

test('an untouched gates list tolerates a legacy invalid gate with a warning (R4 tier 1)', async () => {
  const harness = createReactHarness()
  const view = baseValue({ gates: [LEGACY_INVALID_GATE] })
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(view, 2),
    mutate: () => namespaceView(baseValue({ gates: [LEGACY_INVALID_GATE], leadPlaybook: 'only-playbook' }), 3),
  })
  const { panel } = await openEngineTab(mounted)
  const playbook = findOne(
    panel,
    (element) => element.type === 'textarea' && element.props?.placeholder === 'playbookPlaceholder',
    'the engine playbook textarea must render',
  )
  playbook.props.onChange({ target: { value: 'only-playbook' } })
  const { panel: editedPanel } = await renderEngine(mounted)
  await findButton(await mounted.harness.render(mounted.page), 'save').props.onClick()

  assert.equal(mounted.state.mutateCalls.length, 1, 'tier 1: an untouched gates list must not block the save')
  const ops = mounted.state.mutateCalls[0][1]
  assert.equal(ops.find((op) => op.path[0] === 'leadPlaybook').value, 'only-playbook')
  assert.deepEqual(ops.find((op) => op.path[0] === 'gates').value, [LEGACY_INVALID_GATE])
  const after = await mounted.harness.render(mounted.page)
  const text = textOf(after)
  assert.doesNotMatch(text, /saveFailed/, 'the save succeeds')
  assert.match(text, /gateErrLegacyGate|legacy-broken/, 'the legacy gate is surfaced as a warning')
})

test('editing the gates list rejects a legacy invalid gate before mutating (R4 tier 2)', async () => {
  const harness = createReactHarness()
  const view = baseValue({ gates: [LEGACY_INVALID_GATE] })
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(view, 2),
    mutate: () => namespaceView(baseValue({ gates: [LEGACY_INVALID_GATE] }), 3),
  })
  const { panel } = await openEngineTab(mounted)

  // A local gates edit through the supported EnginePanel onChange prop.
  const gatesPanel = findComponent(panel, 'GatesPanel')
  gatesPanel.props.onChange({ gates: [LEGACY_INVALID_GATE, VALID_GATE_2] })
  const { panel: editedPanel } = await renderEngine(mounted)
  await findButton(await mounted.harness.render(mounted.page), 'save').props.onClick()

  assert.equal(mounted.state.mutateCalls.length, 0, 'tier 2: a touched gates list must be fully validated')
  const after = await mounted.harness.render(mounted.page)
  const text = textOf(after)
  assert.match(text, /gateErrLegacyGate/, 'the offending legacy gate is named')
  assert.match(text, /gateErrDenyRole/, 'the error explains why the gate is invalid')
})

test('a duplicate gate id in the save set is rejected (R4 id-set check)', async () => {
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(baseValue({ gates: [VALID_GATE] }), 2),
    mutate: () => namespaceView(baseValue({ gates: [VALID_GATE] }), 3),
  })
  const { panel } = await openEngineTab(mounted)

  // Touching the gates list with a duplicate id must fail the set-level check.
  const gatesPanel = findComponent(panel, 'GatesPanel')
  gatesPanel.props.onChange({ gates: [VALID_GATE, { ...VALID_GATE }] })
  const { panel: editedPanel } = await renderEngine(mounted)
  await findButton(await mounted.harness.render(mounted.page), 'save').props.onClick()
  assert.equal(mounted.state.mutateCalls.length, 0, 'duplicate ids must not reach mutate')
  const text = textOf(await mounted.harness.render(mounted.page))
  assert.match(text, /gateErrDuplicate|gateErrLegacyGate|manual-gate/)
})

// ---------------------------------------------------------------------------
// v5: saved gates become the write-back baseline
// ---------------------------------------------------------------------------

test('after a save the host-returned gates become the local baseline (v5 R4)', async () => {
  let hostGates = []
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(baseValue({ gates: hostGates }), hostGates.length === 0 ? 2 : 4),
    mutate: () => {
      hostGates = [LEGACY_INVALID_GATE]
      return namespaceView(baseValue({ gates: hostGates }), 4)
    },
  })
  const { panel } = await openEngineTab(mounted)
  await findButton(await mounted.harness.render(mounted.page), 'save').props.onClick() // gates unchanged: tier-1 save succeeds

  const { panel: afterSave } = await renderEngine(mounted)
  const gatesPanel = findComponent(afterSave, 'GatesPanel')
  assert.ok(
    (gatesPanel.props.gates ?? []).some((entry) => entry.id === 'legacy-broken'),
    'engine.gates must adopt the host view gates after a successful save',
  )

  // A playbook-only save now writes the adopted gates back unchanged, with only
  // a legacy warning; it must not be misread as "the gates list changed".
  const playbook = findOne(
    afterSave,
    (element) => element.type === 'textarea' && element.props?.placeholder === 'playbookPlaceholder',
  )
  playbook.props.onChange({ target: { value: 'after-baseline' } })
  const { panel: edited } = await renderEngine(mounted)
  await findButton(await mounted.harness.render(mounted.page), 'save').props.onClick()

  assert.equal(mounted.state.mutateCalls.length, 2)
  const secondOps = mounted.state.mutateCalls[1][1]
  assert.deepEqual(
    secondOps.find((op) => op.path[0] === 'gates').value,
    [LEGACY_INVALID_GATE],
    'the adopted gates are written back unchanged',
  )
  assert.doesNotMatch(textOf(await mounted.harness.render(mounted.page)), /saveFailed/)
})

test('fallback chain rows edit their own model and effort', async () => {
  const harness = createReactHarness()
  const dev = {
    id: 'dev', name: 'DEV', provider: 'p', model: 'main', reasoningEffort: 'high',
    fallbacks: [
      { provider: 'p', model: 'backup', reasoningEffort: 'low' },
      { provider: 'p', model: 'spare', reasoningEffort: '' },
    ],
  }
  const mounted = await mountSection(harness, { describe: () => namespaceView(baseValue({ roles: [dev] }), 1) })
  const rolePanel = findComponent(mounted.tree, 'RolesPanel')
  const tree = await harness.render(rolePanel.type, rolePanel.props)
  const effort = findOne(tree, node => node.type === 'select' && node.props.value === 'low')
  effort.props.onChange({ target: { value: 'medium' } })
  const updated = findComponent(await harness.render(mounted.page), 'RolesPanel').props.selected
  assert.equal(updated.reasoningEffort, 'high', 'the primary effort is untouched')
  assert.deepEqual(updated.fallbacks.map(route => route.reasoningEffort), ['medium', ''])
  assert.equal(updated.fallbackProvider, '', 'editing the chain retires the legacy single fallback')

  const removed = findOne(await harness.render(rolePanel.type, { ...rolePanel.props, selected: updated }), node => node.type === 'button' && node.props['aria-label'] === 'removeFallback')
  removed.props.onClick()
  const after = findComponent(await harness.render(mounted.page), 'RolesPanel').props.selected
  assert.deepEqual(after.fallbacks.map(route => route.model), ['spare'])
})

test('skill preview reveals the selected skill through the host route only on click', async (t) => {
  const posts = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url === '/agent-team-roles/skill-reveal') {
      posts.push({ url, method: init.method, body: JSON.parse(init.body) })
      return { ok: true, json: async () => ({ revealed: true }) }
    }
    const data = url.endsWith('/dev/clean-code-guard') ? { content: '# Clean Code', filePath: 'C:\\skills\\SKILL.md' }
      : url.endsWith('/dev') ? { skills: ['clean-code-guard'] } : { routes: [] }
    return { ok: true, json: async () => data }
  })
  const harness = createReactHarness()
  const dev = { id: 'dev', name: 'DEV' }
  const mounted = await mountSection(harness, { describe: () => namespaceView(baseValue({ roles: [dev] }), 1) })
  const roles = findComponent(mounted.tree, 'RolesPanel')
  const renderRoles = () => harness.render(roles.type, roles.props)
  findButton(await renderRoles(), 'clean-code-guard').props.onClick()
  const preview = findComponent(await renderRoles(), 'SkillReveal')
  const button = findButton(await harness.render(preview.type, preview.props), 'skillReveal')
  assert.deepEqual(posts, [])
  await button.props.onClick()
  assert.deepEqual(posts, [{ url: '/agent-team-roles/skill-reveal', method: 'POST', body: { role: 'dev', skill: 'clean-code-guard' } }])
})

// ---------------------------------------------------------------------------
// Model chain templates: read-only browse by default, explicit edit/cancel,
// named delete confirmation, and route-only application to checked roles.
// ---------------------------------------------------------------------------

/** Catalog routes/efforts behind the template editor's selects. */
function templateCatalog() {
  return [
    { provider: 'p', id: 'main', name: 'Main', efforts: [{ id: 'high', name: 'High' }, { id: 'low', name: 'Low' }], defaultEffort: 'high' },
    { provider: 'p', id: 'backup', name: 'Backup', efforts: [{ id: 'low', name: 'Low' }], defaultEffort: 'low' },
    { provider: 'q', id: 'alt', name: 'Alt', efforts: [{ id: 'medium', name: 'Medium' }], defaultEffort: 'medium' },
    { provider: 'x', id: 'chain', name: 'Chain', efforts: [{ id: 'max', name: 'Max' }], defaultEffort: 'max' },
    ...Array.from({ length: 8 }, (_, index) => ({
      provider: 'se-a',
      id: `backup-${index + 1}`,
      name: `SE backup ${index + 1}`,
      efforts: [{ id: 'high', name: 'High' }],
      defaultEffort: 'high',
    })),
  ]
}

/** Mock the role model catalog (and its non-essential routes) for one test. */
function mockCatalog(t) {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === '/agent-team-roles/model-catalog') {
      return {
        ok: true,
        json: async () => ({
          routes: templateCatalog(),
          efforts: [
            { id: 'high', name: 'High' },
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'max', name: 'Max' },
          ],
        }),
      }
    }
    if (String(url).startsWith('/agent-team-roles/role-skills')) {
      return { ok: false, json: async () => ({}) }
    }
    return { ok: true, json: async () => ({ routes: templateCatalog() }) }
  })
}

/** Re-render the Settings page down to the ModelChainTemplatesPanel. */
async function renderTemplatesPanel(mounted) {
  const page = await mounted.harness.render(mounted.page)
  const rolesPanel = findComponent(page, 'RolesPanel')
  const rolesTree = await mounted.harness.render(rolesPanel.type, rolesPanel.props)
  const panel = findComponent(rolesTree, 'ModelChainTemplatesPanel')
  const panelTree = await mounted.harness.render(panel.type, panel.props)
  return { page, rolesPanel, rolesTree, panel, panelTree }
}

function templateNameInput(tree) {
  return findOne(
    tree,
    (element) => element.type === 'input' && element.props?.['aria-label'] === 'modelChainTemplateName',
    'the template name input must render',
  )
}

function hasTemplateNameInput(tree) {
  return findAll(
    tree,
    (element) => element.type === 'input' && element.props?.['aria-label'] === 'modelChainTemplateName',
  ).length > 0
}

function templateSelect(tree) {
  return findOne(
    tree,
    (element) => element.type === 'select' && element.props?.['aria-label'] === 'modelChainTemplateSelect',
    'the template select must render',
  )
}

/** Find one editor select by its aria-label (primary route, fallback row, ...). */
function ariaSelect(tree, label) {
  return findOne(
    tree,
    (element) => element.type === 'select' && element.props?.['aria-label'] === label,
    `select "${label}" must render`,
  )
}

/** Evaluate chainSummary alone with a readable English stub locale. */
function chainSummaryFor(template) {
  const source = extractFunction('chainSummary')
  assert.ok(source, 'client.js must keep chainSummary')
  const dictionary = {
    modelChainTemplateRoute: 'Primary: {route}',
    modelChainTemplateInherit: 'inherit session',
    modelChainTemplateFallbacksOrdered: 'Fallbacks: {list}',
  }
  const factory = new Function('fill', 't', `${source}\nreturn chainSummary`)
  const fill = (text, params) => String(text).replace(/\{(\w+)\}/g, (match, key) => (params?.[key] ?? ''))
  const t = (key) => dictionary[key] ?? key
  return factory(fill, t)(template, t)
}

function checkboxFor(tree, id) {
  return findOne(
    tree,
    (element) => element.type === 'input' && element.props?.type === 'checkbox' && element.props?.value === id,
    `the ${id} checkbox must render`,
  )
}

test('a saved template is browsed read-only by default and applied directly', async (t) => {
  mockCatalog(t)
  const roles = [
    { id: 'general', name: 'General', provider: 'g', model: 'gen' },
    {
      id: 'dev',
      name: 'DEV',
      description: 'builds',
      persona: 'dev persona',
      provider: 'p',
      model: 'main',
      reasoningEffort: 'high',
      fallbackProvider: 'p',
      fallbackModel: 'old',
      fallbackReasoningEffort: 'low',
      toolMode: 'custom',
      tools: ['read', 'write'],
      skills: ['review'],
      denyCommands: ['\\bgit\\s+push\\b'],
      codexSandbox: 'read-only',
      color: '#abc',
    },
    { id: 'qa', name: 'QA', provider: 'q', model: 'alt', reasoningEffort: 'medium' },
  ]
  const daily = {
    name: 'daily',
    provider: 'p',
    model: 'main',
    reasoningEffort: 'high',
    fallbacks: [
      { provider: 'p', model: 'backup', reasoningEffort: 'low' },
      { provider: 'q', model: 'alt', reasoningEffort: 'medium' },
    ],
  }
  let hostValue = baseValue({ roles, modelChainTemplates: [daily] })
  let revision = 1
  const nextRevision = () => { revision += 1; return revision }
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(hostValue, revision),
    mutate: (namespace, ops) => {
      assert.equal(namespace, NS)
      for (const op of ops) hostValue = { ...hostValue, [op.path[0]]: op.value }
      return namespaceView(hostValue, nextRevision())
    },
  })
  const rolesBefore = JSON.parse(JSON.stringify(hostValue.roles))

  // The first saved template is selected and shown without inputs.
  let view = await renderTemplatesPanel(mounted)
  assert.equal(templateSelect(view.panelTree).props.value, 'daily', 'the first saved template is selected')
  assert.equal(hasTemplateNameInput(view.panelTree), false, 'browse mode has no editable name input')
  const readOnlyText = textOf(view.panelTree)
  assert.match(readOnlyText, /modelChainTemplateReadOnly/)
  assert.match(readOnlyText, /1\. p\/backup · low/, 'fallbacks are listed in order')
  assert.match(readOnlyText, /2\. q\/alt · medium/)
  assert.equal(templateSelect(view.panelTree).props.disabled, false, 'the picker is available while browsing')
  assert.equal(findButton(view.panelTree, 'modelChainTemplateEdit').props.disabled, false)

  // Applying the browsed template needs a checked role; then it edits only the
  // local role routes and the page Save writes the roles.
  assert.equal(findButton(view.panelTree, 'modelChainTemplateApply').props.disabled, true)
  checkboxFor(view.panelTree, 'dev').props.onChange()
  view = await renderTemplatesPanel(mounted)
  assert.equal(findButton(view.panelTree, 'modelChainTemplateApply').props.disabled, false)
  findButton(view.panelTree, 'modelChainTemplateApply').props.onClick()
  view = await renderTemplatesPanel(mounted)
  assert.equal(mounted.state.mutateCalls.length, 0, 'the apply stages locally until the page Save')
  const dev = view.rolesPanel.props.roles.find((role) => role.id === 'dev')
  assert.equal(dev.provider, 'p')
  assert.equal(dev.model, 'main')
  assert.deepEqual(dev.fallbacks, daily.fallbacks)
  assert.equal(dev.fallbackProvider, '', 'the legacy single fallback is retired')
  assert.equal(dev.persona, 'dev persona')
  assert.equal(dev.codexSandbox, 'read-only')
  assert.deepEqual(
    view.rolesPanel.props.roles.filter((role) => role.id !== 'dev'),
    rolesBefore.filter((role) => role.id !== 'dev'),
    'unchecked roles stay byte-identical',
  )

  await findButton(view.page, 'save').props.onClick()
  assert.equal(mounted.state.mutateCalls.length, 1)
  assert.deepEqual(mounted.state.mutateCalls[0][1].map((op) => op.path[0]), ['roles'])
  assert.deepEqual(hostValue.modelChainTemplates, [daily], 'apply never rewrites the template library')
})

test('editing is explicit, disables the picker and New, and cancel discards the draft', async (t) => {
  mockCatalog(t)
  const roles = [{ id: 'general', name: 'General', description: '', provider: '', model: '' }]
  const daily = { name: 'daily', provider: 'p', model: 'main', reasoningEffort: 'high', fallbacks: [] }
  const twin = { name: 'twin', provider: 'q', model: 'alt', reasoningEffort: 'medium', fallbacks: [] }
  let hostValue = baseValue({ roles, modelChainTemplates: [daily, twin] })
  let revision = 1
  const nextRevision = () => { revision += 1; return revision }
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(hostValue, revision),
    mutate: (namespace, ops) => {
      for (const op of ops) hostValue = { ...hostValue, [op.path[0]]: op.value }
      return namespaceView(hostValue, nextRevision())
    },
  })

  let view = await renderTemplatesPanel(mounted)
  assert.equal(templateSelect(view.panelTree).props.value, 'daily')
  // Browse mode: switching the picker just changes the viewed template.
  templateSelect(view.panelTree).props.onChange({ target: { value: 'twin' } })
  view = await renderTemplatesPanel(mounted)
  assert.equal(templateSelect(view.panelTree).props.value, 'twin')
  assert.equal(hasTemplateNameInput(view.panelTree), false)

  // Explicit Edit enters the form; the picker and New are disabled so the
  // draft cannot be replaced by a dropdown change or a new template.
  findButton(view.panelTree, 'modelChainTemplateEdit').props.onClick()
  view = await renderTemplatesPanel(mounted)
  assert.equal(templateNameInput(view.panelTree).props.value, 'twin')
  assert.equal(templateSelect(view.panelTree).props.disabled, true, 'the picker is locked during editing')
  assert.equal(findButton(view.panelTree, 'modelChainTemplateNew').props.disabled, true, 'New is locked during editing')
  assert.equal(findButton(view.panelTree, 'modelChainTemplateApply').props.disabled, true, 'apply waits for a save')

  // Local edits stay in the draft, then cancel discards them and returns to the
  // read-only template that was being browsed.
  templateNameInput(view.panelTree).props.onChange({ target: { value: 'draft-name' } })
  view = await renderTemplatesPanel(mounted)
  ariaSelect(view.panelTree, 'primaryModel').props.onChange({ target: { value: 'p::main' } })
  view = await renderTemplatesPanel(mounted)
  assert.equal(mounted.state.mutateCalls.length, 0, 'editing is local')
  findButton(view.panelTree, 'modelChainTemplateCancel').props.onClick()
  view = await renderTemplatesPanel(mounted)
  assert.equal(hasTemplateNameInput(view.panelTree), false, 'cancel returns to read-only browse')
  assert.equal(templateSelect(view.panelTree).props.value, 'twin')
  assert.deepEqual(hostValue.modelChainTemplates, [daily, twin], 'cancel writes nothing')

  // New enters the same protected edit state with a blank draft.
  findButton(view.panelTree, 'modelChainTemplateNew').props.onClick()
  view = await renderTemplatesPanel(mounted)
  assert.equal(templateNameInput(view.panelTree).props.value, '')
  assert.equal(templateSelect(view.panelTree).props.disabled, true)
  assert.equal(findButton(view.panelTree, 'modelChainTemplateNew').props.disabled, true)
})

test('a successful save returns to the read-only view', async (t) => {
  mockCatalog(t)
  const roles = [{ id: 'general', name: 'General', description: '', provider: '', model: '' }]
  let hostValue = baseValue({ roles, modelChainTemplates: [] })
  let revision = 1
  const nextRevision = () => { revision += 1; return revision }
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(hostValue, revision),
    mutate: (namespace, ops) => {
      for (const op of ops) hostValue = { ...hostValue, [op.path[0]]: op.value }
      return namespaceView(hostValue, nextRevision())
    },
  })

  let view = await renderTemplatesPanel(mounted)
  assert.match(textOf(view.panelTree), /modelChainTemplateEmpty/)
  assert.equal(hasTemplateNameInput(view.panelTree), false, 'no template means no editor until New')

  findButton(view.panelTree, 'modelChainTemplateNew').props.onClick()
  view = await renderTemplatesPanel(mounted)
  templateNameInput(view.panelTree).props.onChange({ target: { value: 'daily' } })
  view = await renderTemplatesPanel(mounted)
  ariaSelect(view.panelTree, 'primaryModel').props.onChange({ target: { value: 'p::main' } })
  view = await renderTemplatesPanel(mounted)
  ariaSelect(view.panelTree, 'effort').props.onChange({ target: { value: 'high' } })
  view = await renderTemplatesPanel(mounted)
  await findButton(view.panelTree, 'modelChainTemplateSave').props.onClick()

  assert.equal(mounted.state.mutateCalls.length, 1)
  assert.deepEqual(mounted.state.mutateCalls[0][1].map((op) => op.path[0]), ['modelChainTemplates'])
  assert.deepEqual(hostValue.modelChainTemplates, [{
    name: 'daily',
    provider: 'p',
    model: 'main',
    reasoningEffort: 'high',
    fallbacks: [],
  }])
  view = await renderTemplatesPanel(mounted)
  assert.equal(hasTemplateNameInput(view.panelTree), false, 'a successful save returns to read-only')
  assert.match(textOf(view.panelTree), /modelChainTemplateReadOnly/)
  assert.equal(templateSelect(view.panelTree).props.value, 'daily')
  assert.equal(findButton(view.panelTree, 'modelChainTemplateEdit').props.disabled, false)
})

test('delete is secondary, asks for the named template, and keeps or reselects correctly', async (t) => {
  mockCatalog(t)
  const roles = [{ id: 'general', name: 'General', description: '', provider: '', model: '' }]
  const a = { name: 'a', provider: 'p', model: 'main', reasoningEffort: 'high', fallbacks: [] }
  const b = { name: 'b', provider: 'p', model: 'backup', reasoningEffort: 'low', fallbacks: [] }
  const c = { name: 'c', provider: 'q', model: 'alt', reasoningEffort: 'medium', fallbacks: [] }
  let hostValue = baseValue({ roles, modelChainTemplates: [a, b, c] })
  let revision = 1
  let failWrites = false
  const nextRevision = () => { revision += 1; return revision }
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(hostValue, revision),
    mutate: (namespace, ops) => {
      if (failWrites) return { ok: false, error: { code: 'conflict', message: 'revision conflict' } }
      for (const op of ops) hostValue = { ...hostValue, [op.path[0]]: op.value }
      return namespaceView(hostValue, nextRevision())
    },
  })

  // The delete action is a quiet control at the bottom, not a primary button.
  let view = await renderTemplatesPanel(mounted)
  const ask = findButton(view.panelTree, 'modelChainTemplateDelete')
  assert.equal(ask.props.style.background, 'transparent', 'delete is a secondary action')
  ask.props.onClick()
  view = await renderTemplatesPanel(mounted)
  assert.match(textOf(view.panelTree), /modelChainTemplateDeleteConfirm/)
  findButton(view.panelTree, 'modelChainTemplateCancel').props.onClick()
  view = await renderTemplatesPanel(mounted)
  assert.equal(mounted.state.mutateCalls.length, 0, 'cancel leaves the library alone')
  assert.deepEqual(hostValue.modelChainTemplates, [a, b, c])
  assert.equal(templateSelect(view.panelTree).props.value, 'a')

  // A rejected write keeps the template and the browse selection.
  failWrites = true
  findButton(view.panelTree, 'modelChainTemplateDelete').props.onClick()
  view = await renderTemplatesPanel(mounted)
  await findButton(view.panelTree, 'modelChainTemplateDeleteAction').props.onClick()
  view = await renderTemplatesPanel(mounted)
  assert.match(textOf(view.page), /saveFailed/)
  assert.deepEqual(hostValue.modelChainTemplates, [a, b, c], 'a failed delete keeps the template')
  assert.equal(templateSelect(view.panelTree).props.value, 'a')

  // Successful deletes pick the next neighbour, then the previous, then empty.
  failWrites = false
  view = await renderTemplatesPanel(mounted)
  findButton(view.panelTree, 'modelChainTemplateDelete').props.onClick()
  view = await renderTemplatesPanel(mounted)
  await findButton(view.panelTree, 'modelChainTemplateDeleteAction').props.onClick()
  assert.deepEqual(hostValue.modelChainTemplates, [b, c])
  view = await renderTemplatesPanel(mounted)
  assert.equal(templateSelect(view.panelTree).props.value, 'b', 'deleting the first selects the next')

  findButton(view.panelTree, 'modelChainTemplateDelete').props.onClick()
  view = await renderTemplatesPanel(mounted)
  await findButton(view.panelTree, 'modelChainTemplateDeleteAction').props.onClick()
  assert.deepEqual(hostValue.modelChainTemplates, [c])
  view = await renderTemplatesPanel(mounted)
  assert.equal(templateSelect(view.panelTree).props.value, 'c')

  findButton(view.panelTree, 'modelChainTemplateDelete').props.onClick()
  view = await renderTemplatesPanel(mounted)
  await findButton(view.panelTree, 'modelChainTemplateDeleteAction').props.onClick()
  assert.deepEqual(hostValue.modelChainTemplates, [])
  view = await renderTemplatesPanel(mounted)
  assert.equal(templateSelect(view.panelTree).props.value, '')
  assert.match(textOf(view.panelTree), /modelChainTemplateEmpty/)
  assert.equal(findAll(view.panelTree, (element) => element.type === 'button' && textOf(element) === 'modelChainTemplateDelete').length, 0,
    'no delete control without a template')
})

test('a session-inherited template is created without a role and previews its ordered fallbacks', async (t) => {
  mockCatalog(t)
  const roles = [{ id: 'general', name: 'General', description: '', provider: 'g', model: 'gen' }]
  let hostValue = baseValue({ roles, modelChainTemplates: [] })
  let revision = 1
  const nextRevision = () => { revision += 1; return revision }
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(hostValue, revision),
    mutate: (namespace, ops) => {
      for (const op of ops) hostValue = { ...hostValue, [op.path[0]]: op.value }
      return namespaceView(hostValue, nextRevision())
    },
  })

  let view = await renderTemplatesPanel(mounted)
  findButton(view.panelTree, 'modelChainTemplateNew').props.onClick()
  view = await renderTemplatesPanel(mounted)
  templateNameInput(view.panelTree).props.onChange({ target: { value: 'inherit' } })
  view = await renderTemplatesPanel(mounted)
  // The primary select stays at "inherit session"; two fallbacks are added.
  findButton(view.panelTree, '＋ addFallback').props.onClick()
  view = await renderTemplatesPanel(mounted)
  ariaSelect(view.panelTree, 'fallbackModel #1').props.onChange({ target: { value: 'se-a::backup-1' } })
  view = await renderTemplatesPanel(mounted)
  ariaSelect(view.panelTree, 'effort #1').props.onChange({ target: { value: 'high' } })
  view = await renderTemplatesPanel(mounted)
  findButton(view.panelTree, '＋ addFallback').props.onClick()
  view = await renderTemplatesPanel(mounted)
  ariaSelect(view.panelTree, 'fallbackModel #2').props.onChange({ target: { value: 'se-a::backup-2' } })
  view = await renderTemplatesPanel(mounted)
  await findButton(view.panelTree, 'modelChainTemplateSave').props.onClick()

  assert.deepEqual(hostValue.modelChainTemplates, [{
    name: 'inherit',
    provider: '',
    model: '',
    reasoningEffort: '',
    fallbacks: [
      { provider: 'se-a', model: 'backup-1', reasoningEffort: 'high' },
      { provider: 'se-a', model: 'backup-2', reasoningEffort: '' },
    ],
  }])
  const saved = hostValue.modelChainTemplates[0]
  view = await renderTemplatesPanel(mounted)
  assert.match(textOf(view.panelTree), /1\. se-a\/backup-1 · high/)
  assert.match(textOf(view.panelTree), /2\. se-a\/backup-2/)
  assert.match(chainSummaryFor(saved), /^Primary: inherit session · Fallbacks: #1 se-a\/backup-1 · high → #2 se-a\/backup-2/)

  // Applying it clears a role's primary route while installing the chain.
  checkboxFor(view.panelTree, 'general').props.onChange()
  view = await renderTemplatesPanel(mounted)
  findButton(view.panelTree, 'modelChainTemplateApply').props.onClick()
  view = await renderTemplatesPanel(mounted)
  const general = view.rolesPanel.props.roles.find((role) => role.id === 'general')
  assert.equal(general.provider, '')
  assert.equal(general.model, '')
  assert.deepEqual(general.fallbacks, saved.fallbacks)

  await findButton(view.page, 'save').props.onClick()
  const savedGeneral = hostValue.roles.find((role) => role.id === 'general')
  assert.equal(savedGeneral.provider, '')
  assert.deepEqual(savedGeneral.fallbacks, saved.fallbacks)
})

test('an empty chain is refused and loaded templates are normalized', async (t) => {
  mockCatalog(t)
  let hostValue = baseValue({
    roles: [{ id: 'general', name: 'General', description: '', provider: '', model: '' }],
    // Trimmed, de-duplicated, capped, and legacy entries without a usable name drop out.
    modelChainTemplates: [
      { name: ' keep ', provider: ' p ', model: 'm', reasoningEffort: 'high' },
      { name: 'keep', provider: 'dup', model: 'dup' },
      'broken',
      { name: '', provider: 'x', model: 'y' },
      { name: 'half', provider: 'p', model: '' },
      {
        name: 'many',
        provider: '',
        model: '',
        fallbacks: Array.from({ length: 10 }, (_, index) => ({
          provider: 'se-a',
          model: `backup-${index + 1}`,
          reasoningEffort: '',
        })),
      },
      {
        name: 'legacy',
        provider: 'p',
        model: 'm',
        reasoningEffort: 'high',
        fallbackProvider: 'p',
        fallbackModel: 'old',
        fallbackReasoningEffort: 'low',
      },
    ],
  })
  let revision = 1
  const nextRevision = () => { revision += 1; return revision }
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(hostValue, revision),
    mutate: (namespace, ops) => {
      for (const op of ops) hostValue = { ...hostValue, [op.path[0]]: op.value }
      return namespaceView(hostValue, nextRevision())
    },
  })

  let view = await renderTemplatesPanel(mounted)
  assert.deepEqual(
    findAll(templateSelect(view.panelTree), (element) => element.type === 'option').map(textOf),
    [
      'modelChainTemplateNone',
      'keep — p/m · high',
      'half — modelChainTemplateInherit',
      'many — modelChainTemplateInherit',
      'legacy — p/m · high',
    ],
    'invalid and duplicate stored templates are dropped',
  )
  assert.deepEqual(view.panel.props.templates, [{
    name: 'keep',
    provider: 'p',
    model: 'm',
    reasoningEffort: 'high',
    fallbacks: [],
  }, {
    name: 'half',
    provider: '',
    model: '',
    reasoningEffort: '',
    fallbacks: [],
  }, {
    name: 'many',
    provider: '',
    model: '',
    reasoningEffort: '',
    fallbacks: Array.from({ length: 8 }, (_, index) => ({
      provider: 'se-a',
      model: `backup-${index + 1}`,
      reasoningEffort: '',
    })),
  }, {
    name: 'legacy',
    provider: 'p',
    model: 'm',
    reasoningEffort: 'high',
    fallbacks: [{ provider: 'p', model: 'old', reasoningEffort: 'low' }],
  }], 'stored entries are trimmed, paired, capped, and older single-fallback shapes are kept')

  // Opening the half-filled entry and saving it is refused: an empty primary
  // route is legal, but only when the template carries a fallback chain.
  templateSelect(view.panelTree).props.onChange({ target: { value: 'half' } })
  view = await renderTemplatesPanel(mounted)
  findButton(view.panelTree, 'modelChainTemplateEdit').props.onClick()
  view = await renderTemplatesPanel(mounted)
  await findButton(view.panelTree, 'modelChainTemplateSave').props.onClick()
  view = await renderTemplatesPanel(mounted)
  assert.match(textOf(view.panelTree), /modelChainTemplateEmptyChain/)
  assert.equal(mounted.state.mutateCalls.length, 0)
  assert.equal(hasTemplateNameInput(view.panelTree), true, 'a failed save stays in the editor')
})

test('model dropdowns group by provider and invalid operations are disabled', async (t) => {
  mockCatalog(t)
  const roles = [{ id: 'general', name: 'General', description: '', provider: '', model: '' }]
  const full = {
    name: 'full',
    provider: 'p',
    model: 'main',
    reasoningEffort: 'high',
    fallbacks: Array.from({ length: 8 }, (_, index) => ({
      provider: 'se-a',
      model: `backup-${index + 1}`,
      reasoningEffort: '',
    })),
  }
  let hostValue = baseValue({ roles, modelChainTemplates: [full] })
  let revision = 1
  const nextRevision = () => { revision += 1; return revision }
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(hostValue, revision),
    mutate: (namespace, ops) => {
      for (const op of ops) hostValue = { ...hostValue, [op.path[0]]: op.value }
      return namespaceView(hostValue, nextRevision())
    },
  })

  let view = await renderTemplatesPanel(mounted)
  findButton(view.panelTree, 'modelChainTemplateEdit').props.onClick()
  view = await renderTemplatesPanel(mounted)
  const primary = ariaSelect(view.panelTree, 'primaryModel')
  assert.deepEqual(
    findAll(primary, (element) => element.type === 'optgroup').map((element) => element.props.label),
    ['p', 'q', 'x', 'se-a'],
    'model options are grouped by provider',
  )
  assert.equal(findButton(view.panelTree, '＋ addFallback').props.disabled, true, 'the fallback cap disables adding')
  assert.equal(findOne(view.panelTree, (element) => element.type === 'button' && element.props?.['aria-label'] === 'moveUp').props.disabled, true)
  assert.equal(findAll(view.panelTree, (element) => element.type === 'button' && element.props?.['aria-label'] === 'moveDown').at(-1).props.disabled, true)
  assert.equal(findButton(view.panelTree, 'modelChainTemplateApply').props.disabled, true, 'editing disables apply')
  // Inherit has no reasoning effort, so that select is disabled and empty.
  primary.props.onChange({ target: { value: '' } })
  view = await renderTemplatesPanel(mounted)
  const effort = ariaSelect(view.panelTree, 'effort')
  assert.equal(effort.props.disabled, true)
  assert.equal(effort.props.value, '')
})

test('role rows show all exact chain matches, not just the primary model or selected template', async (t) => {
  mockCatalog(t)
  const a = { provider: 'p', model: 'a', reasoningEffort: 'high' }
  const b = { provider: 'q', model: 'b', reasoningEffort: 'low' }
  const data = baseValue({ roles: [
    { id: 'dev', name: 'Dev', fallbacks: [a, b] },
    { id: 'qa', name: 'QA', fallbacks: [b, a] },
    { id: 'se', name: 'SE', fallbackProvider: 'p', fallbackModel: 'a', fallbackReasoningEffort: 'high' },
    { id: 'pm', name: 'PM', fallbacks: [{ ...a, reasoningEffort: 'low' }] },
  ], modelChainTemplates: [{ name: 'Daily', fallbacks: [a, b] }, { name: 'Twin', fallbacks: [a, b] }, { name: 'Single', fallbacks: [a] }] })
  const mounted = await mountSection(createReactHarness(), { describe: () => namespaceView(data, 1) })
  const { panelTree } = await renderTemplatesPanel(mounted)
  const row = id => textOf(findOne(panelTree, el => el.type === 'label' && textOf(el).includes(`(${id})`), id))
  assert.match(row('dev'), /matchingTemplates: Daily \/ Twin/)
  assert.match(row('qa'), /noMatchingTemplate/)
  assert.match(row('se'), /matchingTemplates: Single/)
  assert.match(row('pm'), /noMatchingTemplate/)
})

test('template CRUD never writes or discards an unsaved role draft', async (t) => {
  mockCatalog(t)
  const roles = [
    { id: 'general', name: 'General', description: '', provider: '', model: '' },
    {
      id: 'dev',
      name: 'DEV',
      description: 'builds',
      persona: 'saved persona',
      provider: 'p',
      model: 'main',
      reasoningEffort: 'high',
    },
  ]
  let hostValue = baseValue({ roles, modelChainTemplates: [] })
  let revision = 1
  let failWrites = false
  const nextRevision = () => { revision += 1; return revision }
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(hostValue, revision),
    mutate: (namespace, ops) => {
      if (failWrites) return { ok: false, error: { code: 'conflict', message: 'revision conflict' } }
      for (const op of ops) hostValue = { ...hostValue, [op.path[0]]: op.value }
      return namespaceView(hostValue, nextRevision())
    },
  })
  const hostRolesBefore = JSON.parse(JSON.stringify(hostValue.roles))

  // One unsaved role edit: it must stay local while templates are created.
  const page = await harness.render(mounted.page)
  findComponent(page, 'RolesPanel').props.onEdit({ persona: 'draft persona' })
  let view = await renderTemplatesPanel(mounted)
  assert.equal(
    view.rolesPanel.props.roles.find((role) => role.id === 'dev').persona,
    'draft persona',
    'the draft edit is applied locally',
  )

  // Build a template from scratch (no source role), then fail its first write.
  findButton(view.panelTree, 'modelChainTemplateNew').props.onClick()
  view = await renderTemplatesPanel(mounted)
  templateNameInput(view.panelTree).props.onChange({ target: { value: 'bundled' } })
  view = await renderTemplatesPanel(mounted)
  ariaSelect(view.panelTree, 'primaryModel').props.onChange({ target: { value: 'p::main' } })
  view = await renderTemplatesPanel(mounted)
  ariaSelect(view.panelTree, 'effort').props.onChange({ target: { value: 'high' } })
  view = await renderTemplatesPanel(mounted)
  failWrites = true
  await findButton(view.panelTree, 'modelChainTemplateSave').props.onClick()
  view = await renderTemplatesPanel(mounted)
  assert.match(textOf(view.page), /saveFailed/, 'the failed template write is reported')
  assert.equal(
    view.rolesPanel.props.roles.find((role) => role.id === 'dev').persona,
    'draft persona',
    'a failed template save keeps the unsaved role draft',
  )
  assert.equal(templateNameInput(view.panelTree).props.value, 'bundled', 'the draft template survives the failure')
  assert.deepEqual(hostValue.roles, hostRolesBefore, 'nothing from the role draft reached the host')

  // A successful template save writes only the templates field and returns to
  // the read-only view without reloading over the role draft.
  failWrites = false
  view = await renderTemplatesPanel(mounted)
  await findButton(view.panelTree, 'modelChainTemplateSave').props.onClick()
  assert.equal(mounted.state.mutateCalls.length, 2, 'the failed attempt plus the retry both reached the Remote')
  assert.deepEqual(mounted.state.mutateCalls.at(-1)[1].map((op) => op.path[0]), ['modelChainTemplates'])
  assert.deepEqual(hostValue.modelChainTemplates, [{
    name: 'bundled',
    provider: 'p',
    model: 'main',
    reasoningEffort: 'high',
    fallbacks: [],
  }])
  assert.deepEqual(hostValue.roles, hostRolesBefore, 'the unsaved persona stays out of the template write')

  view = await renderTemplatesPanel(mounted)
  assert.equal(hasTemplateNameInput(view.panelTree), false, 'a successful save returns to read-only')
  assert.equal(
    view.rolesPanel.props.roles.find((role) => role.id === 'dev').persona,
    'draft persona',
    'the successful template save does not reload over the draft',
  )

  // The explicit page Save is the action that publishes the role draft.
  await findButton(view.page, 'save').props.onClick()
  assert.equal(mounted.state.mutateCalls.length, 3)
  assert.deepEqual(mounted.state.mutateCalls.at(-1)[1].map((op) => op.path[0]), ['roles'])
  assert.equal(hostValue.roles.find((role) => role.id === 'dev').persona, 'draft persona')
})

/** Top-level keys of one inlined locale dictionary. */
function dictionaryKeys(marker) {
  const start = clientSrc.indexOf(marker)
  assert.ok(start >= 0, `client.js must keep ${marker}`)
  const end = clientSrc.indexOf('\n    }\n', start)
  assert.ok(end > start, `${marker} must close`)
  return [...clientSrc.slice(start, end).matchAll(/^\s{6}([A-Za-z_$][\w$]*):/gm)].map((match) => match[1])
}

test('every model chain template locale key exists in both dictionaries', () => {
  const zhKeys = new Set(dictionaryKeys('const zh = {'))
  const enKeys = new Set(dictionaryKeys('const en = {'))
  const used = new Set()
  for (const match of clientSrc.matchAll(/t\('(modelChainTemplate\w+)'\)/g)) used.add(match[1])
  used.add('matchingTemplates')
  used.add('noMatchingTemplate')
  for (const key of used) {
    assert.ok(zhKeys.has(key), `the zh dictionary must define ${key}`)
    assert.ok(enKeys.has(key), `the en dictionary must define ${key}`)
  }
})
