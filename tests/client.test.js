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



