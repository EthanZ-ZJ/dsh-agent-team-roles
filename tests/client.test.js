/**
 * Headless client checks.
 *
 * `client.js` is a browser bundle, but its factory is a plain function: this
 * file loads it with a tiny React-hook runtime and a fake settings Remote. That
 * makes the client behaviours the contract calls out for TSE (cr #11/#17, R1)
 * unit-testable without a DOM or the running GUI.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizeGate, validateGate } from '../src/gates.js'

const clientSrc = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const contractSrc = fs.readFileSync(new URL('../docs/gates-nl-ui-contract.md', import.meta.url), 'utf8')

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

/** Read one top-level object literal and evaluate it. */
function extractObjectLiteral(marker) {
  const markerAt = clientSrc.indexOf(marker)
  assert.ok(markerAt >= 0, `client.js must contain ${marker}`)
  const braceAt = clientSrc.indexOf('{', markerAt)
  let depth = 0
  let quote = null
  for (let index = braceAt; index < clientSrc.length; index += 1) {
    const char = clientSrc[index]
    if (quote !== null) {
      if (char === '\\') {
        index += 1
        continue
      }
      if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return new Function(`return ${clientSrc.slice(braceAt, index + 1)}`)()
    }
  }
  assert.fail(`unterminated object literal after ${marker}`)
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

function createClientContext({ describe, mutate }) {
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

/** View objects shared by the old-Host and R1 scenarios. */
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

// ---------------------------------------------------------------------------
// cr #17: old Host without the parse fields
// ---------------------------------------------------------------------------

test('old Host without gateParse fields: settings page mounts, manual create/save still works (cr #17)', async () => {
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(baseValue({ gates: [VALID_GATE], gatesDisabled: [] }), 5),
    mutate: () => namespaceView(baseValue({ gates: [VALID_GATE], gatesDisabled: [] }), 6),
  })
  const { engine, panel } = await openEngineTab(mounted)

  // GatesPanel renders both entries; EnginePanel only hosts it, so render it.
  const gatesPanel = findComponent(panel, 'GatesPanel')
  const gatesTree = await mounted.harness.render(gatesPanel.type, gatesPanel.props)

  // The manual entry and the natural-language entry both render; neither reads
  // a parse field that a legacy Host would not send.
  assert.ok(findAll(gatesTree, (element) => element.type === 'button' && textOf(element) === 'gateAdd').length >= 1)
  const entryKey = [...contractSrc.matchAll(/^\|\s*`(gateAi[A-Za-z0-9]+)`\s*\|[^|]*\|([^|]*)\|/gm)]
    .find((match) => match[2].includes('用自然语言新增'))?.[1]
  assert.ok(entryKey, 'the contract §10 must define the natural-language entry key')
  assert.equal(
    findAll(gatesTree, (element) => element.type === 'button' && textOf(element) === entryKey).length,
    1,
    `the natural-language entry (${entryKey}) must render on the manual path`,
  )

  // The stored gate is still displayed through the manual path.
  const card = findOne(
    gatesTree,
    (element) => element.props?.gate?.id === 'manual-gate',
    'the legacy gate must be rendered by the manual gate list',
  )
  assert.ok(card)

  // Saving from the manual path must not require the parse fields.
  const saveButton = findButton(panel, 'save')
  await saveButton.props.onClick()
  const afterSaveTree = await mounted.harness.render(mounted.page)
  assert.equal(mounted.state.mutateCalls.length, 1)
  const ops = mounted.state.mutateCalls[0][1]
  assert.ok(ops.some((op) => op.path[0] === 'gates'), 'the manual save still writes gates')
  assert.ok(!ops.some((op) => op.path[0] === 'gateParseRequest'), 'no parse request is written by a manual save')
  assert.ok(!ops.some((op) => op.path[0] === 'gateParseResult'), 'no parse result is cleared by a manual save')
  assert.ok(engine)
})

// ---------------------------------------------------------------------------
// cr #11: revision refresh and conflict-code recognition
// ---------------------------------------------------------------------------

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
  assert.ok(writes.length >= 4, `expected several mutate call sites, found ${writes.length}`)
  for (const at of writes) {
    const window = clientSrc.slice(at, at + 900)
    assert.match(window, /setRevision|refreshParseAndRevision/, 'a mutate must be followed by a revision refresh')
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
  await findButton(panelAfterEdit, 'save').props.onClick()
  const afterFailure = await harness.render(mounted.page)
  const engineAfterFailure = findComponent(afterFailure, 'EnginePanel')
  const panelAfterFailure = await harness.render(engineAfterFailure.type, engineAfterFailure.props)
  const keptField = findOne(
    panelAfterFailure,
    (element) => element.type === 'textarea' && element.props?.placeholder === 'playbookPlaceholder',
  )
  assert.equal(keptField.props.value, 'local-draft', 'R1: the failed save must not overwrite the local draft')
  assert.ok(mounted.state.describeCalls > describeBefore, 'the failure path re-reads the revision')
  assert.match(textOf(afterFailure), /saveFailed|gateParseErrConflict|gateErrConflict/, 'a retryable error is shown')
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
  await findButton(panel, 'save').props.onClick()
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
  await findButton(editedPanel, 'save').props.onClick()

  assert.equal(mounted.state.mutateCalls.length, 1, 'tier 1: an untouched gates list must not block the save')
  const ops = mounted.state.mutateCalls[0][1]
  assert.equal(ops.find((op) => op.path[0] === 'leadPlaybook').value, 'only-playbook')
  assert.deepEqual(ops.find((op) => op.path[0] === 'gates').value, [LEGACY_INVALID_GATE])
  const after = await mounted.harness.render(mounted.page)
  const text = textOf(after)
  assert.doesNotMatch(text, /saveFailed/, 'the save succeeds')
  assert.match(text, /gateParseErrLegacyGate|legacy-broken/, 'the legacy gate is surfaced as a warning')
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
  await findButton(editedPanel, 'save').props.onClick()

  assert.equal(mounted.state.mutateCalls.length, 0, 'tier 2: a touched gates list must be fully validated')
  const after = await mounted.harness.render(mounted.page)
  const text = textOf(after)
  assert.match(text, /gateParseErrLegacyGate/, 'the offending legacy gate is named')
  assert.match(text, /gateErrDenyRole|gateParseValidate/, 'the error explains why the gate is invalid')
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
  await findButton(editedPanel, 'save').props.onClick()
  assert.equal(mounted.state.mutateCalls.length, 0, 'duplicate ids must not reach mutate')
  const text = textOf(await mounted.harness.render(mounted.page))
  assert.match(text, /gateParseValidateDuplicate|gateParseErrLegacyGate|manual-gate/)
})

// ---------------------------------------------------------------------------
// D8: the 90s client timeout clears the handshake fields
// ---------------------------------------------------------------------------

function withFakeTimers() {
  const real = {
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
    clearTimeout: globalThis.clearTimeout,
    clearInterval: globalThis.clearInterval,
  }
  const timeouts = []
  const intervals = []
  globalThis.setTimeout = (callback, ms, ...args) => {
    const handle = { callback, ms, args, cleared: false }
    timeouts.push(handle)
    return handle
  }
  globalThis.setInterval = (callback, ms, ...args) => {
    const handle = { callback, ms, args, cleared: false }
    intervals.push(handle)
    return handle
  }
  globalThis.clearTimeout = (handle) => {
    if (handle !== null && typeof handle === 'object') handle.cleared = true
  }
  globalThis.clearInterval = (handle) => {
    if (handle !== null && typeof handle === 'object') handle.cleared = true
  }
  return {
    timeouts,
    intervals,
    restore() {
      globalThis.setTimeout = real.setTimeout
      globalThis.setInterval = real.setInterval
      globalThis.clearTimeout = real.clearTimeout
      globalThis.clearInterval = real.clearInterval
    },
  }
}

test('the 90s client timeout clears the pending request and result (D8)', async () => {
  const fake = withFakeTimers()
  try {
    const pendingRequest = { nonce: 'pending-9', text: 'pending requirement', at: Date.now() }
    const emptyResult = { nonce: '', status: '', gates: [], note: '', warnings: [], code: '', detail: '', completedAt: 0 }
    let mutateCalls = 0
    const harness = createReactHarness()
    const mounted = await mountSection(harness, {
      describe: () => namespaceView(baseValue({
        gateParseRequest: pendingRequest,
        gateParseResult: emptyResult,
      }), 2),
      mutate: () => {
        mutateCalls += 1
        return namespaceView(baseValue({
          gateParseRequest: { nonce: '', text: '', at: 0 },
          gateParseResult: emptyResult,
        }), 3)
      },
    })
    assert.ok(mounted)

    const timeout = fake.timeouts.find((handle) => handle.ms === 90_000)
    assert.ok(timeout, 'a 90s timer must be armed while a parse is pending')
    await timeout.callback()
    await harness.render(mounted.page)
    await Promise.resolve()

    assert.equal(mutateCalls, 1, 'the timeout performs one cleanup mutate')
    const ops = mounted.state.mutateCalls[0][1]
    const requestOp = ops.find((op) => op.path[0] === 'gateParseRequest')
    const resultOp = ops.find((op) => op.path[0] === 'gateParseResult')
    assert.ok(requestOp, 'the timed-out request is cleared')
    assert.equal(requestOp.value.nonce, '')
    assert.ok(resultOp, 'the stale result slot is cleared too')
    assert.equal(resultOp.value.status, '')
  } finally {
    fake.restore()
  }
})

test('the 90s timeout leaves a readable error state, not a silent idle (v5)', async () => {
  const fake = withFakeTimers()
  try {
    const pendingRequest = { nonce: 'pending-err', text: 'pending requirement', at: Date.now() }
    const emptyResult = { nonce: '', status: '', gates: [], note: '', warnings: [], code: '', detail: '', completedAt: 0 }
    const harness = createReactHarness()
    const mounted = await mountSection(harness, {
      describe: () => namespaceView(baseValue({
        gateParseRequest: pendingRequest,
        gateParseResult: emptyResult,
      }), 2),
      mutate: () => namespaceView(baseValue({
        gateParseRequest: { nonce: '', text: '', at: 0 },
        gateParseResult: emptyResult,
      }), 3),
    })
    const timeout = fake.timeouts.find((handle) => handle.ms === 90_000)
    assert.ok(timeout, 'a 90s timer must be armed while a parse is pending')
    await timeout.callback()
    const pageTree = await harness.render(mounted.page)
    await Promise.resolve()

    const { panel } = await renderEngine(mounted)
    const gatesPanel = findComponent(panel, 'GatesPanel')
    const gatesTree = await harness.render(gatesPanel.type, gatesPanel.props)
    const text = `${textOf(pageTree)}\n${textOf(gatesTree)}`
    assert.match(text, /gateAiThinkingTimeout|gateParseErrTimeout/, 'the user must see a readable timeout error')
    assert.match(text, /gateAdd|gateParseManual/, 'a manual fallback must remain available')
  } finally {
    fake.restore()
  }
})

const EMPTY_RESULT = {
  nonce: '',
  status: '',
  gates: [],
  note: '',
  warnings: [],
  code: '',
  detail: '',
  completedAt: 0,
}

async function gatesPanelWith({ resultGates = [], gates = [], overrides = {} } = {}) {
  const harness = createReactHarness()
  const mounted = await mountSection(harness, {
    describe: () => namespaceView(baseValue(), 2),
    mutate: () => namespaceView(baseValue(), 3),
  })
  const { panel } = await openEngineTab(mounted)
  const gatesPanel = findComponent(panel, 'GatesPanel')
  const result = {
    ...EMPTY_RESULT,
    nonce: 'r1',
    status: 'ok',
    gates: resultGates,
    completedAt: Date.now(),
  }
  const pendingNonce = overrides.pendingNonce ?? 'r1'
  const props = {
    t: (key) => key,
    gates,
    disabled: [],
    onChange: () => {},
    parse: {
      request: { nonce: pendingNonce, text: 'requirement', at: Date.now() },
      result,
    },
    parseError: '',
    parseTimeoutNonce: '',
    pendingNonce,
    writable: true,
    parseFieldsPresent: true,
    onStartParse: async () => {},
    onCancelParse: async () => {},
    onClearParseResult: async () => {},
    onConsumeParse: () => {},
    ...overrides,
  }
  const tree = await harness.render(gatesPanel.type, props)
  return { harness, mounted, gatesPanel, tree, props }
}

const ALL_SHELL_GATE = {
  id: 'all-shell',
  deny: { role: 'general', tool: ['bash', 'pwsh'] },
  require: { event: 'done', byRoles: ['checker'] },
  description: '',
}

const REGEX_SHELL_GATE = {
  id: 'regex-shell',
  deny: { role: 'general', tool: ['bash', 'pwsh'], commandPattern: '^npm test$' },
  require: { event: 'done', byRoles: ['checker'] },
  description: '',
}

test('a whole-shell gate warns but a regex-constrained shell gate does not (v5)', async () => {
  const wholeShell = await gatesPanelWith({ resultGates: [ALL_SHELL_GATE] })
  assert.match(textOf(wholeShell.tree), /gateParseWarnAllShell/, 'no commandPattern + both shells must warn')

  const regexShell = await gatesPanelWith({ resultGates: [REGEX_SHELL_GATE] })
  assert.doesNotMatch(textOf(regexShell.tree), /gateParseWarnAllShell/, 'a commandPattern gate must not warn')
})

test('a self-produced key is warned for event and commandSuccess keys (v5)', async () => {
  const eventSelfKey = await gatesPanelWith({
    resultGates: [{
      id: 'self-event',
      deny: { role: 'general', tool: ['bash'] },
      require: { event: 'done', byRoles: ['general'] },
      description: '',
    }],
  })
  assert.match(textOf(eventSelfKey.tree), /gateParseWarnSelfKey/)

  const commandSelfKey = await gatesPanelWith({
    resultGates: [{
      id: 'self-command',
      deny: { role: 'general', tool: ['bash'] },
      require: { commandSuccess: { role: 'general', tool: ['pwsh'], pattern: '^npm test$' } },
      description: '',
    }],
  })
  assert.match(textOf(commandSelfKey.tree), /gateParseWarnSelfKey/)
})

test('a dangerous gate cannot be adopted before the ack is checked (v5)', async () => {
  const adopted = []
  const { harness, gatesPanel, tree, props } = await gatesPanelWith({
    resultGates: [ALL_SHELL_GATE],
    overrides: {
      onChange: (patch) => {
        if (Array.isArray(patch.gates)) adopted.push(patch.gates)
      },
    },
  })
  const adopt = findOne(
    tree,
    (element) => element.type === 'button' && textOf(element) === 'gateParseAdopt',
    'the per-draft adopt button must render',
  )
  if (adopt.props.disabled !== true) await adopt.props.onClick()
  assert.deepEqual(adopted, [], 'an unacknowledged dangerous gate must not enter engine.gates')

  // After checking the ack, the same adopt action must succeed.
  const ack = findOne(
    tree,
    (element) => element.type === 'input' && element.props?.type === 'checkbox',
    'a dangerous draft needs the ack checkbox',
  )
  ack.props.onChange({ target: { checked: true } })
  const ackedTree = await harness.render(gatesPanel.type, props)
  const adoptAcked = findOne(
    ackedTree,
    (element) => element.type === 'button' && textOf(element) === 'gateParseAdopt',
    'the adopt button must render after acknowledgement',
  )
  await adoptAcked.props.onClick()
  assert.ok(adopted.length >= 1, 'an acknowledged dangerous gate can be adopted')
})

test('adopt-all also refuses an unacknowledged dangerous batch (v5)', async () => {
  const adopted = []
  const { tree } = await gatesPanelWith({
    resultGates: [ALL_SHELL_GATE],
    overrides: {
      onChange: (patch) => {
        if (Array.isArray(patch.gates)) adopted.push(patch.gates)
      },
    },
  })
  const adoptAll = findOne(
    tree,
    (element) => element.type === 'button' && textOf(element) === 'gateParseAdoptAll',
    'the adopt-all button must render',
  )
  if (adoptAll.props.disabled !== true) await adoptAll.props.onClick()
  assert.deepEqual(adopted, [], 'an unacknowledged dangerous batch must not be adopted')
})

test('ignoring one draft keeps the stored result (v5)', async () => {
  let cleared = 0
  let gateChanges = 0
  const { tree } = await gatesPanelWith({
    resultGates: [{
      id: 'ignore-me',
      deny: { role: 'general', tool: ['bash'] },
      require: { event: 'done', byRoles: ['checker'] },
      description: '',
    }],
    overrides: {
      onClearParseResult: async () => { cleared += 1 },
      onChange: (patch) => { if (Array.isArray(patch.gates)) gateChanges += 1 },
    },
  })
  const ignore = findOne(
    tree,
    (element) => element.type === 'button' && textOf(element) === 'gateParseIgnore',
    'the ignore button must render',
  )
  await ignore.props.onClick()
  assert.equal(cleared, 0, 'ignoring a draft must not clear gateParseResult')
  assert.equal(gateChanges, 0, 'ignoring a draft must not change gates')
})

test('discarding the whole result requires a confirmation and clears the field (v5)', async () => {
  let cleared = 0
  const { harness, gatesPanel, tree, props } = await gatesPanelWith({
    resultGates: [{
      id: 'discard-me',
      deny: { role: 'general', tool: ['bash'] },
      require: { event: 'done', byRoles: ['checker'] },
      description: '',
    }],
    overrides: {
      onClearParseResult: async () => { cleared += 1 },
    },
  })
  const discard = findOne(
    tree,
    (element) => element.type === 'button' && textOf(element) === 'gateParseDiscardResult',
    'the discard-result button must render',
  )
  await discard.props.onClick()
  assert.equal(cleared, 0, 'discard needs a second confirmation before clearing')

  const confirmTree = await harness.render(gatesPanel.type, props)
  const confirm = findOne(
    confirmTree,
    (element) => element.type === 'button' && textOf(element) === 'gateParseDiscardResult',
    'the confirm button must render after the first click',
  )
  await confirm.props.onClick()
  assert.equal(cleared, 1, 'the confirmed discard clears the stored result exactly once')
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
  await findButton(panel, 'save').props.onClick() // gates unchanged: tier-1 save succeeds

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
  await findButton(edited, 'save').props.onClick()

  assert.equal(mounted.state.mutateCalls.length, 2)
  const secondOps = mounted.state.mutateCalls[1][1]
  assert.deepEqual(
    secondOps.find((op) => op.path[0] === 'gates').value,
    [LEGACY_INVALID_GATE],
    'the adopted gates are written back unchanged',
  )
  assert.doesNotMatch(textOf(await mounted.harness.render(mounted.page)), /saveFailed/)
})

// ---------------------------------------------------------------------------
// v5: abandon must not write when the remote nonce already moved on
// ---------------------------------------------------------------------------

test('a 90s abandon with a mismatched remote nonce clears only local state (v5)', async () => {
  const fake = withFakeTimers()
  try {
    const empty = { nonce: '', text: '', at: 0 }
    const localRequest = { nonce: 'local-1', text: 'local requirement', at: Date.now() }
    const remoteRequest = { nonce: 'remote-2', text: 'remote change', at: Date.now() }
    let remoteMoved = false
    const harness = createReactHarness()
    const mounted = await mountSection(harness, {
      describe: () => namespaceView(baseValue({
        gateParseRequest: remoteMoved ? remoteRequest : localRequest,
        gateParseResult: EMPTY_RESULT,
      }), remoteMoved ? 6 : 2),
      mutate: () => namespaceView(baseValue({ gateParseRequest: empty, gateParseResult: EMPTY_RESULT }), 7),
    })

    remoteMoved = true
    const timeout = fake.timeouts.find((handle) => handle.ms === 90_000)
    assert.ok(timeout, 'the 90s timer must be armed for the pending request')
    await timeout.callback()
    await harness.render(mounted.page)
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(mounted.state.mutateCalls.length, 0, 'a remote nonce mismatch must not trigger a cleanup write')
    const text = textOf(await harness.render(mounted.page))
    assert.doesNotMatch(text, /gateAiThinking/, 'the local thinking state is abandoned')
  } finally {
    fake.restore()
  }
})







// ---------------------------------------------------------------------------
// Schema-shaped adoption regression (commit 98f2877): the Host's Config schema
// fills empty `commandSuccess` / `invalidateOn` objects into stored gates.
// Adoption must canonicalize them before local validation.
// ---------------------------------------------------------------------------

const HOST_SHAPED_EVENT_GATE = {
  id: 'tse-regression-before-dev-commit',
  deny: { role: 'general', tool: ['bash', 'pwsh'], commandPattern: '\\bgit\\s+commit\\b' },
  require: {
    event: 'regression-test-passed',
    byRoles: ['general'],
    freshFor: 14400,
    commandSuccess: { role: '', tool: [], pattern: '' },
    invalidateOn: { role: 'general', tool: ['write', 'edit'] },
  },
  description: 'schema-default shape',
}

const HOST_SHAPED_COMMAND_GATE = {
  id: 'tse-schema-command-shape',
  deny: { role: 'general', tool: ['bash', 'pwsh'], commandPattern: '\\bgit\\s+commit\\b' },
  require: {
    event: '',
    byRoles: [],
    freshFor: 14400,
    commandSuccess: { role: 'general', tool: ['pwsh'], pattern: '\\bpnpm\\s+test\\b' },
    invalidateOn: { role: '', tool: [] },
  },
  description: 'schema command shape',
}

function collectGates(overrides = {}) {
  const adopted = []
  return {
    adopted,
    overrides: {
      onChange: (patch) => {
        if (Array.isArray(patch.gates)) adopted.push(...patch.gates)
      },
      ...overrides,
    },
  }
}

test('a schema-defaulted event gate adopts canonically and stays host-valid (98f2877)', async () => {
  const collected = collectGates()
  const { harness, gatesPanel, tree, props } = await gatesPanelWith({
    resultGates: [HOST_SHAPED_EVENT_GATE],
    overrides: collected.overrides,
  })
  const adopt = findOne(
    tree,
    (element) => element.type === 'button' && textOf(element) === 'gateParseAdopt',
    'the adopt button must render',
  )
  assert.notEqual(adopt.props.disabled, true, 'an empty schema commandSuccess must not block adoption')
  await adopt.props.onClick()

  assert.equal(collected.adopted.length, 1)
  const gate = collected.adopted[0]
  assert.equal(gate.id, HOST_SHAPED_EVENT_GATE.id)
  assert.equal('commandSuccess' in gate.require, false, 'the empty schema commandSuccess is stripped')
  assert.equal(gate.require.event, 'regression-test-passed')
  assert.equal(validateGate(normalizeGate(gate)), undefined, 'the adopted gate must survive a Host validate round-trip')

  const after = await harness.render(gatesPanel.type, props)
  assert.doesNotMatch(textOf(after), /gateErrInvalid|gateParseErrLegacyGate/, 'no invalid-gate error is shown')
})

test('adopt-all also accepts a schema-defaulted event gate (98f2877)', async () => {
  const collected = collectGates()
  const { tree } = await gatesPanelWith({
    resultGates: [HOST_SHAPED_EVENT_GATE],
    overrides: collected.overrides,
  })
  const adoptAll = findOne(
    tree,
    (element) => element.type === 'button' && textOf(element) === 'gateParseAdoptAll',
    'the adopt-all button must render',
  )
  assert.notEqual(adoptAll.props.disabled, true, 'an empty schema commandSuccess must not block adopt-all')
  await adoptAll.props.onClick()

  assert.equal(collected.adopted.length, 1)
  assert.equal('commandSuccess' in collected.adopted[0].require, false)
  assert.equal(validateGate(normalizeGate(collected.adopted[0])), undefined)
})

test('a schema-defaulted commandSuccess gate adopts canonically (98f2877)', async () => {
  const collected = collectGates()
  const { tree } = await gatesPanelWith({
    resultGates: [HOST_SHAPED_COMMAND_GATE],
    overrides: collected.overrides,
  })
  const adopt = findOne(
    tree,
    (element) => element.type === 'button' && textOf(element) === 'gateParseAdopt',
    'the adopt button must render',
  )
  await adopt.props.onClick()

  assert.equal(collected.adopted.length, 1)
  const gate = collected.adopted[0]
  assert.equal('event' in gate.require, false, 'the empty event default is stripped')
  assert.equal(gate.require.commandSuccess.role, 'general')
  assert.equal(gate.require.commandSuccess.tool.includes('pwsh'), true)
  assert.equal(validateGate(normalizeGate(gate)), undefined)
})

test('the read-only preview card uses the candidate chip, not gateOn (98f2877)', async () => {
  const { harness, tree } = await gatesPanelWith({ resultGates: [HOST_SHAPED_EVENT_GATE] })
  const card = findOne(
    tree,
    (element) => element.type?.name === 'GateCard',
    'the read-only preview card must render',
  )
  const cardTree = await harness.render(card.type, card.props)
  assert.match(textOf(cardTree), /candidate/)
  assert.doesNotMatch(textOf(cardTree), /gateOn/)
})
