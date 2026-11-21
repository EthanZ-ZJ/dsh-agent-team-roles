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
  assert.deepEqual(ops.map((op) => op.path[0]), ['leadPlaybook', 'activeTemplate', 'freshProvider', 'forkProvider', 'gates', 'gatesDisabled'])
  assert.deepEqual(hostValue.gates, [VALID_GATE, VALID_GATE_2])
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
