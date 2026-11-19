/**
 * Host-side natural-language gate parser (`src/gate-parse.js`).
 *
 * The contract (docs/gates-nl-ui-contract.md, v2) defines the parser as a
 * black-box installed with `installGateParser({ ctx, config })`: it watches
 * `settings/document-updated`, reads `gateParseRequest`, calls
 * `ctx.get('llm').stream(...)`, and atomically writes `gateParseResult` while
 * clearing the request. These tests drive exactly that surface with a fake ctx,
 * a fake Config, and a scripted LLM stream, and assert the one invariant that
 * matters most: no failure path ever writes `gates`.
 */

import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { installGateParser } from '../src/gate-parse.js'
import { GENERAL_ROLE } from '../src/config.js'
import { normalizeGate, validateGate } from '../src/gates.js'

const NS = 'agent-team-roles'
const PURPOSE = 'agent-team-roles-gate-parse'

// Every parse appends to `stateDir()/gate-parse-audit.jsonl`. Point DSH_HOME at
// a throwaway directory for the whole file so tests never touch ~/.dsh.
const ORIGINAL_DSH_HOME = process.env.DSH_HOME
let sharedHome
before(async () => {
  sharedHome = await fs.mkdtemp(path.join(os.tmpdir(), 'atr-gate-home-'))
  process.env.DSH_HOME = sharedHome
})
after(async () => {
  if (ORIGINAL_DSH_HOME === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = ORIGINAL_DSH_HOME
  if (sharedHome !== undefined) await fs.rm(sharedHome, { recursive: true, force: true })
})

/** Domain vocabulary the generic parser must not embed (contract §5.4/§12.6). */
const DOMAIN_WORDS = /\b(git|commit|review|reviewer|dev|tse|cr|pm)\b|开发|提交|评审|回归|架构|契约/

const DEFAULT_TEXT = '当测试通过后才允许继续'

function rolesFixture() {
  return [
    { ...GENERAL_ROLE },
    { id: 'dev', name: 'Dev', description: 'Builds the product.' },
    { id: 'cr', name: 'Cr', description: 'Checks the product.' },
    { id: 'tse', name: 'Tse', description: 'Tests the product.' },
  ]
}

function validGate(overrides = {}) {
  return {
    id: 'checks-passed',
    deny: { role: 'dev', tool: ['bash', 'pwsh'], commandPattern: '^\\bpnpm\\s+test\\b' },
    require: { event: 'checks-passed', byRoles: ['tse'], freshFor: 14400 },
    description: '测试通过后才允许继续',
    ...overrides,
  }
}

function modelOutput(gates, note = '假设使用 pwsh') {
  return JSON.stringify({ gates, note })
}

function emptyRequest(overrides = {}) {
  return { nonce: '', text: '', at: 0, ...overrides }
}

function emptyResult(overrides = {}) {
  return {
    nonce: '',
    status: '',
    gates: [],
    note: '',
    warnings: [],
    code: '',
    detail: '',
    completedAt: 0,
    ...overrides,
  }
}

async function waitFor(predicate, { timeout = 3000, interval = 5 } = {}) {
  const startedAt = Date.now()
  for (;;) {
    if (predicate()) return true
    if (Date.now() - startedAt > timeout) return false
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

/** An async stream that immediately yields every text delta and then finishes. */
function immediateStream(texts) {
  return async function* stream() {
    for (const text of texts) yield { type: 'text-delta', text }
    yield { type: 'finish' }
  }
}

/** A stream that only continues after `control.unblock()` or an abort signal. */
function controlledStream() {
  const control = { started: false, aborted: false, chunks: [] }
  control.stream = async function* stream(options) {
    control.started = true
    control.signal = options.signal
    let unblock
    const wait = new Promise((resolve) => {
      unblock = resolve
    })
    control.unblock = unblock
    const onAbort = () => {
      control.aborted = true
      unblock()
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) onAbort()
    await wait
    if (options.signal?.aborted) {
      yield { type: 'finish', kind: 'aborted', failure: { code: 'ABORTED', message: 'aborted' } }
      return
    }
    for (const chunk of control.chunks) yield chunk
  }
  return control
}

function createRuntime(overrides = {}) {
  const config = {
    roles: overrides.roles ?? rolesFixture(),
    gates: structuredClone(overrides.gates ?? []),
    gatesDisabled: [],
    activeTemplate: '',
    leadPlaybook: '',
    gateParseRequest: emptyRequest({
      nonce: overrides.nonce ?? 'abc123req',
      text: overrides.text ?? DEFAULT_TEXT,
      at: overrides.at ?? Date.now(),
      ...(overrides.request ?? {}),
    }),
    gateParseResult: emptyResult(overrides.result),
  }

  const stats = {
    edits: 0,
    resultWrites: 0,
    requestClears: 0,
    gateWrites: 0,
    llmCalls: 0,
    llmOptions: [],
    warns: [],
    errors: [],
  }
  const handlers = new Map()
  const disposers = []

  const services = {}
  if (overrides.noLlm !== true) {
    services.llm = {
      stream(options) {
        stats.llmCalls += 1
        stats.llmOptions.push(options)
        if (typeof overrides.stream === 'function') return overrides.stream(options, stats)
        return immediateStream(overrides.texts ?? [
          overrides.modelText ?? modelOutput([validGate()]),
        ])(options)
      },
    }
  }
  if (overrides.noDefaultModel !== true) {
    services.agentDefaultModel = {
      currentSelection() {
        if (overrides.selection === null) return null
        if (overrides.selection !== undefined) return overrides.selection
        return { provider: 'test-provider', model: 'test-model' }
      },
    }
  }
  services.configEditor = {
    async edit(entry, mutate) {
      stats.edits += 1
      const call = stats.edits
      // The real editor's callback is synchronous; awaiting tolerates both.
      const next = await mutate(config)
      if (typeof overrides.failEdit === 'function') {
        const failure = overrides.failEdit(call)
        if (failure === true) throw new Error(`injected configEditor failure on edit #${call}`)
        if (failure instanceof Error) throw failure
        if (typeof failure === 'string' && failure !== '') throw new Error(failure)
      }
      if (next === undefined || next === config) return
      const gatesBefore = JSON.stringify(config.gates)
      const completedBefore = config.gateParseResult.completedAt
      const nonceBefore = config.gateParseRequest.nonce
      Object.assign(config, next)
      if (JSON.stringify(config.gates) !== gatesBefore) stats.gateWrites += 1
      if (config.gateParseResult.completedAt !== completedBefore) stats.resultWrites += 1
      if (nonceBefore !== '' && config.gateParseRequest.nonce === '') stats.requestClears += 1
    },
  }

  const ctx = {
    get(name) {
      if (name === 'llm' && overrides.noLlm === true) return undefined
      if (name === 'agentDefaultModel' && overrides.noDefaultModel === true) return undefined
      if (name === 'configEditor' && overrides.noEditor === true) return undefined
      return services[name]
    },
    on(event, callback) {
      handlers.set(event, callback)
      return () => handlers.delete(event)
    },
    effect(install, _label) {
      const dispose = install()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    fiber: { entry: {} },
    logger: {
      info: () => {},
      warn: (...args) => stats.warns.push(args.map(String).join(' ')),
      error: (...args) => stats.errors.push(args.map(String).join(' ')),
    },
  }

  const runtime = {
    config,
    stats,
    handlers,
    ctx,
    async emit(namespace = NS) {
      const handler = handlers.get('settings/document-updated')
      if (handler !== undefined) await handler(namespace)
    },
    waitFor,
    async settle(ms = 80) {
      await new Promise((resolve) => setTimeout(resolve, ms))
    },
    async waitResult({ timeout = 3000 } = {}) {
      return waitFor(() => config.gateParseResult.status !== '', { timeout })
    },
    dispose() {
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          // disposal failures must not mask the assertion under test
        }
      }
    },
  }
  return runtime
}

/** Install the parser; tolerates both `(args)` and `(args, options)` signatures. */
function installParser(runtime, options) {
  const parser = options === undefined
    ? installGateParser({ ctx: runtime.ctx, config: runtime.config })
    : installGateParser({ ctx: runtime.ctx, config: runtime.config }, options)
  assert.equal(typeof parser?.dispose, 'function', 'installGateParser must return { dispose }')
  return parser
}

function setup(t, overrides = {}) {
  const runtime = createRuntime(overrides)
  const parser = installParser(runtime, overrides.options)
  runtime.parser = parser
  t.after(() => {
    try {
      parser.dispose()
    } catch {
      // ignore disposal failures
    }
    runtime.dispose()
  })
  return runtime
}

async function runParse(t, overrides = {}) {
  const runtime = setup(t, overrides)
  await runtime.emit()
  const done = await runtime.waitResult({ timeout: overrides.resultTimeout ?? 3000 })
  return { runtime, done }
}

function collectUnhandledRejections(t) {
  const rejections = []
  const listener = (reason) => rejections.push(reason)
  process.on('unhandledRejection', listener)
  t.after(() => process.off('unhandledRejection', listener))
  return rejections
}

async function expectError(t, modelText, code, overrides = {}) {
  const { runtime, done } = await runParse(t, { modelText, ...overrides })
  assert.equal(done, true, 'the parser must settle with a result')
  const result = runtime.config.gateParseResult
  assert.equal(result.status, 'error', `expected status=error, got ${result.status}`)
  assert.equal(result.code, code)
  assert.deepEqual(result.gates, [], 'error results carry no gates')
  assert.deepEqual(runtime.config.gates, [], 'no failure path may write gates')
  assert.equal(runtime.stats.gateWrites, 0)
  assert.equal(runtime.config.gateParseRequest.nonce, '', 'the request is cleared after handling')
  return { runtime, result }
}

// ---------------------------------------------------------------------------
// Happy path, prompt assembly, and the no-write invariant
// ---------------------------------------------------------------------------

test('happy path parses a valid gate, clears the request, and never writes gates', async (t) => {
  const text = '开发提交代码前必须由测试同学跑通回归，4 小时内有效'
  const { runtime, done } = await runParse(t, { text, nonce: 'req0001' })
  assert.equal(done, true, 'the parser must complete')

  const result = runtime.config.gateParseResult
  assert.equal(result.status, 'ok')
  assert.equal(result.nonce, 'req0001')
  assert.equal(result.gates.length, 1)
  assert.equal(validateGate(normalizeGate(result.gates[0])), undefined, 'result gates must pass validateGate')
  assert.ok(result.completedAt > 0, 'completedAt is set for a finished parse')
  assert.equal(result.code, '')
  assert.ok(Array.isArray(result.warnings))

  assert.equal(runtime.config.gateParseRequest.nonce, '')
  assert.equal(runtime.config.gateParseRequest.text, '', 'the request text is no longer persisted')
  assert.equal(runtime.stats.gateWrites, 0, 'parsing must never mutate gates')
  assert.deepEqual(runtime.config.gates, [])
  assert.equal(runtime.stats.llmCalls, 1)
  assert.doesNotMatch(JSON.stringify(result), /开发提交代码前必须/, 'the result must not echo the raw requirement')
})

test('the llm request uses the declared purpose, route, and deterministic settings', async (t) => {
  const text = '当测试通过后才允许继续'
  const { runtime } = await runParse(t, { text })
  const options = runtime.stats.llmOptions[0]
  assert.equal(runtime.stats.llmCalls, 1)
  assert.equal(options.purpose, PURPOSE)
  assert.equal(options.temperature, 0)
  assert.equal(options.maxTokens, 1200)
  assert.equal(options.provider, 'test-provider')
  assert.equal(options.model, 'test-model')
  assert.equal(typeof options.system, 'string')
  assert.ok(options.system.length > 0)
  const serialized = JSON.stringify(options.messages)
  assert.ok(serialized.includes(text), 'the user requirement must reach the model')
  assert.equal(options.messages[0].role, 'user')
})

test('the prompt carries role ids, existing gate ids, and the platform shell tool without domain words', async (t) => {
  const neutralRoles = [{ ...GENERAL_ROLE }]
  const gate = validGate({ id: 'existing-one' })
  const runtime = setup(t, {
    roles: neutralRoles,
    text: 'something must happen first',
    nonce: 'prompt01',
    gates: [gate],
    modelText: modelOutput([validGate({ id: 'new-one' })]),
  })
  await runtime.emit()
  assert.equal(await runtime.waitResult(), true)

  const options = runtime.stats.llmOptions[0]
  const prompt = `${options.system}\n${JSON.stringify(options.messages)}`
  assert.ok(prompt.includes('general'), 'configured roles must be offered to the model')
  assert.ok(prompt.includes('existing-one'), 'existing gate ids must be offered to the model')
  assert.match(prompt, /\b(pwsh|bash)\b/, 'the platform shell tool must be named')
  assert.doesNotMatch(options.system, DOMAIN_WORDS, 'the system prompt must stay domain-neutral')
  assert.doesNotMatch(JSON.stringify(options.messages), DOMAIN_WORDS, 'the assembled prompt must stay domain-neutral')
})

test('gates are not written even when normalization succeeds', async (t) => {
  const existing = [validGate({ id: 'keep-me' })]
  const { runtime } = await runParse(t, { gates: existing, modelText: modelOutput([validGate({ id: 'new-gate' })]) })
  assert.equal(runtime.config.gateParseResult.status, 'ok')
  assert.equal(runtime.stats.gateWrites, 0)
  assert.deepEqual(runtime.config.gates, existing)
})

// ---------------------------------------------------------------------------
// Output parsing: malformed and out-of-contract model output
// ---------------------------------------------------------------------------

test('a JSON fenced answer is unwrapped and parsed', async (t) => {
  const text = `\`\`\`json\n${modelOutput([validGate()])}\n\`\`\``
  const { runtime, done } = await runParse(t, { modelText: text })
  assert.equal(done, true)
  assert.equal(runtime.config.gateParseResult.status, 'ok')
})

test('a single bare gate object is tolerated as a one-item batch', async (t) => {
  const { runtime, done } = await runParse(t, { modelText: JSON.stringify(validGate()) })
  assert.equal(done, true)
  assert.equal(runtime.config.gateParseResult.status, 'ok')
  assert.equal(runtime.config.gateParseResult.gates.length, 1)
})

test('prose that is not JSON at all is invalid-output', async (t) => {
  await expectError(t, 'Sure! Here is your gate: deny dev ...', 'invalid-output')
})

test('truncated JSON is invalid-output', async (t) => {
  await expectError(t, '{"gates":[{"id":"x"', 'invalid-output')
})

test('a gate without deny.tool is invalid-output', async (t) => {
  const broken = { id: 'broken', deny: { role: 'dev' }, require: { event: 'ok', byRoles: ['tse'] } }
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('a gate with an invalid regex is invalid-output', async (t) => {
  const broken = validGate({ deny: { role: 'dev', tool: ['bash'], commandPattern: '([bad' } })
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('a commandPattern longer than 200 characters is invalid-output', async (t) => {
  const broken = validGate({ deny: { role: 'dev', tool: ['bash'], commandPattern: 'a'.repeat(201) } })
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('an invalid event name is invalid-output', async (t) => {
  const broken = validGate({ require: { event: 'Not An Event', byRoles: ['tse'] } })
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('requiring both an event and a commandSuccess is invalid-output', async (t) => {
  const broken = validGate({
    require: {
      event: 'ok',
      byRoles: ['tse'],
      commandSuccess: { role: 'tse', tool: ['pwsh'], pattern: '^pnpm test$' },
    },
  })
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('more than five gates in one batch is invalid-output', async (t) => {
  const gates = Array.from({ length: 6 }, (_, index) => validGate({ id: `gate-${index}` }))
  await expectError(t, modelOutput(gates), 'invalid-output')
})

test('exactly five gates is accepted', async (t) => {
  const gates = Array.from({ length: 5 }, (_, index) => validGate({ id: `gate-${index}` }))
  const { runtime, done } = await runParse(t, { modelText: modelOutput(gates) })
  assert.equal(done, true)
  assert.equal(runtime.config.gateParseResult.status, 'ok')
  assert.equal(runtime.config.gateParseResult.gates.length, 5)
})

test('unknown fields are ignored rather than stored', async (t) => {
  const noisy = {
    ...validGate(),
    gatesDisabled: true,
    somethingElse: { nested: 1 },
  }
  const payload = JSON.stringify({ gates: [noisy], note: 'ok', extraTopLevel: 'ignored' })
  const { runtime, done } = await runParse(t, { modelText: payload })
  assert.equal(done, true)
  assert.equal(runtime.config.gateParseResult.status, 'ok')
  const [gate] = runtime.config.gateParseResult.gates
  assert.equal(gate.gatesDisabled, undefined)
  assert.equal(gate.somethingElse, undefined)
  assert.equal(runtime.config.gateParseResult.extraTopLevel, undefined)
})

test('empty gate text is rejected before any model call', async (t) => {
  const { runtime, done } = await runParse(t, { text: '   ', nonce: 'empty01' })
  assert.equal(done, true)
  assert.equal(runtime.config.gateParseResult.status, 'error')
  assert.equal(runtime.config.gateParseResult.code, 'empty-text')
  assert.equal(runtime.stats.llmCalls, 0, 'empty text must not reach the model')
  assert.equal(runtime.stats.gateWrites, 0)
  assert.equal(runtime.config.gateParseRequest.nonce, '')
})

test('request text over 4000 characters is text-too-long and never reaches the model', async (t) => {
  const { runtime, done } = await runParse(t, { text: 'x'.repeat(4001), nonce: 'long01' })
  assert.equal(done, true)
  assert.equal(runtime.config.gateParseResult.status, 'error')
  assert.equal(runtime.config.gateParseResult.code, 'text-too-long')
  assert.equal(runtime.stats.llmCalls, 0)
  assert.equal(runtime.stats.gateWrites, 0)
})

test('a prompt larger than 24 KiB is prompt-too-large and never reaches the model', async (t) => {
  const bigRoles = [{ ...GENERAL_ROLE }]
  for (let index = 0; index < 160; index += 1) {
    bigRoles.push({
      id: `role-${index}`,
      name: `Role ${index}`,
      description: 'd'.repeat(200),
      persona: '',
      tools: [],
      skills: [],
      denyCommands: [],
      color: '',
      toolMode: 'all',
    })
  }
  const { runtime, done } = await runParse(t, {
    roles: bigRoles,
    text: 'x'.repeat(200),
    nonce: 'big001',
  })
  assert.equal(done, true)
  assert.equal(runtime.config.gateParseResult.status, 'error')
  assert.equal(runtime.config.gateParseResult.code, 'prompt-too-large')
  assert.equal(runtime.stats.llmCalls, 0, 'an oversized prompt must not be truncated and sent')
  assert.equal(runtime.stats.gateWrites, 0)
})

test('an empty gate list with a note is needs-input', async (t) => {
  const { runtime, done } = await runParse(t, {
    modelText: JSON.stringify({ gates: [], note: '请说明由哪个角色批准' }),
  })
  assert.equal(done, true)
  const result = runtime.config.gateParseResult
  assert.equal(result.status, 'needs-input')
  assert.deepEqual(result.gates, [])
  assert.equal(result.note, '请说明由哪个角色批准')
  assert.equal(result.code, '')
  assert.equal(runtime.stats.gateWrites, 0)
})

test('an over-long note is truncated to 2000 characters instead of failing the parse', async (t) => {
  const { runtime, done } = await runParse(t, {
    modelText: JSON.stringify({ gates: [validGate()], note: 'n'.repeat(2500) }),
  })
  assert.equal(done, true)
  const result = runtime.config.gateParseResult
  assert.equal(result.status, 'ok')
  assert.ok(result.note.length <= 2000, 'note must not exceed 2000 characters')
})

test('warnings are capped at 10 entries of 200 characters', async (t) => {
  const broken = validGate({
    deny: { role: 'dev', tool: ['bash'], commandPattern: '^pnpm test$' },
  })
  const { runtime, done } = await runParse(t, { modelText: modelOutput([broken]) })
  assert.equal(done, true)
  const result = runtime.config.gateParseResult
  assert.equal(result.status, 'ok')
  assert.ok(result.warnings.length <= 10)
  for (const warning of result.warnings) {
    assert.ok(typeof warning === 'string')
    assert.ok(warning.length <= 200)
  }
})

// ---------------------------------------------------------------------------
// Role and tool checks
// ---------------------------------------------------------------------------

test('an unknown deny role is invalid-output', async (t) => {
  const broken = validGate({ deny: { role: 'ghost', tool: ['bash', 'pwsh'] } })
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('a deny role of "lead" is rejected because the Lead is never gated', async (t) => {
  const broken = validGate({ deny: { role: 'lead', tool: ['bash', 'pwsh'] } })
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('a deny role of "lead" inside commandSuccess is rejected too', async (t) => {
  const broken = validGate({
    require: {
      commandSuccess: { role: 'lead', tool: ['pwsh'], pattern: '^pnpm test$' },
      byRoles: ['tse'],
    },
  })
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('an unknown byRoles entry is invalid-output', async (t) => {
  const broken = validGate({ require: { event: 'ok', byRoles: ['tse', 'ghost'] } })
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('an unknown invalidateOn role is invalid-output', async (t) => {
  const broken = validGate({
    require: {
      event: 'ok',
      byRoles: ['tse'],
      invalidateOn: { role: 'ghost', tool: ['write'] },
    },
  })
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('more than eight tools is rejected explicitly instead of silently truncated', async (t) => {
  const broken = validGate({
    deny: { role: 'dev', tool: Array.from({ length: 9 }, (_, index) => `tool-${index}`) },
  })
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('more than eight byRoles is rejected explicitly', async (t) => {
  const broken = validGate({
    require: { event: 'ok', byRoles: Array.from({ length: 9 }, () => 'tse') },
  })
  await expectError(t, modelOutput([broken]), 'invalid-output')
})

test('empty strings never appear in a stored tool list', async (t) => {
  const gate = validGate({ deny: { role: 'dev', tool: ['', 'bash'] } })
  const { runtime, done } = await runParse(t, { modelText: modelOutput([gate]) })
  assert.equal(done, true)
  const stored = runtime.config.gateParseResult.gates[0]
  assert.ok(stored.deny.tool.every((tool) => tool !== ''))
})

test('a command gate auto-fills bash and pwsh and records a warning', async (t) => {
  const gate = validGate({ deny: { role: 'dev', tool: ['bash'], commandPattern: '^pnpm test$' } })
  const { runtime, done } = await runParse(t, { modelText: modelOutput([gate]) })
  assert.equal(done, true)
  const result = runtime.config.gateParseResult
  assert.equal(result.status, 'ok')
  const tools = result.gates[0].deny.tool
  assert.ok(tools.includes('bash'), 'bash stays in the list')
  assert.ok(tools.includes('pwsh'), 'pwsh is auto-filled for command gates')
  assert.equal(new Set(tools).size, tools.length, 'tool lists stay de-duplicated')
  assert.ok(result.warnings.length >= 1, 'auto-filling is surfaced as a warning')
  assert.equal(validateGate(normalizeGate(result.gates[0])), undefined)
})

test('a command gate that already lists both shells does not duplicate them', async (t) => {
  const gate = validGate({ deny: { role: 'dev', tool: ['bash', 'pwsh'], commandPattern: '^pnpm test$' } })
  const { runtime, done } = await runParse(t, { modelText: modelOutput([gate]) })
  assert.equal(done, true)
  const tools = runtime.config.gateParseResult.gates[0].deny.tool
  assert.equal(tools.filter((tool) => tool === 'bash').length, 1)
  assert.equal(tools.filter((tool) => tool === 'pwsh').length, 1)
})

// ---------------------------------------------------------------------------
// Host-generated ids (Q4/Q6)
// ---------------------------------------------------------------------------

test('a valid model id is preserved', async (t) => {
  const { runtime } = await runParse(t, { modelText: modelOutput([validGate({ id: 'my-gate' })]) })
  assert.equal(runtime.config.gateParseResult.gates[0].id, 'my-gate')
})

test('an unsanitized model id is cleaned into lowercase kebab-case', async (t) => {
  const { runtime } = await runParse(t, { modelText: modelOutput([validGate({ id: 'My Gate!' })]) })
  const id = runtime.config.gateParseResult.gates[0].id
  assert.match(id, /^[a-z][a-z0-9-]*$/, 'final ids must pass the gate id grammar')
  assert.ok(!id.includes(' '))
})

test('an empty or unusable model id falls back to gate-<nonce prefix>', async (t) => {
  const { runtime } = await runParse(t, {
    nonce: 'abc123req',
    modelText: modelOutput([validGate({ id: '!!!' })]),
  })
  assert.equal(runtime.config.gateParseResult.status, 'ok')
  const id = runtime.config.gateParseResult.gates[0].id
  assert.match(id, /^gate-[a-z0-9]{6}$/, `unexpected fallback id: ${id}`)
})

test('model ids starting with a digit fall back to gate-<hash6> instead of failing (v4)', async (t) => {
  for (const candidate of ['9abc', '2024-review']) {
    const { runtime } = await runParse(t, {
      nonce: `digit-${candidate}`,
      modelText: modelOutput([validGate({ id: candidate })]),
    })
    const result = runtime.config.gateParseResult
    assert.equal(result.status, 'ok', `a digit-leading id (${candidate}) must not be invalid-output`)
    const id = result.gates[0].id
    assert.match(id, /^gate-[a-z0-9]{6}$/, `expected gate-<hash6>, got ${id}`)
    assert.notEqual(id, candidate)
    assert.equal(validateGate(normalizeGate(result.gates[0])), undefined)
  }
})

test('a colliding model id gains a numeric suffix and never overwrites the existing gate', async (t) => {
  const existing = [validGate({ id: 'checks-passed' })]
  const { runtime } = await runParse(t, {
    gates: existing,
    modelText: modelOutput([validGate({ id: 'checks-passed' })]),
  })
  const result = runtime.config.gateParseResult
  assert.equal(result.status, 'ok')
  assert.equal(result.gates[0].id, 'checks-passed-2')
  assert.equal(runtime.stats.gateWrites, 0)
  assert.deepEqual(runtime.config.gates, existing, 'the existing gate is untouched')
})

test('a collision chain advances to the next free suffix', async (t) => {
  const existing = [validGate({ id: 'dup-id' }), validGate({ id: 'dup-id-2' })]
  const { runtime } = await runParse(t, {
    gates: existing,
    modelText: modelOutput([validGate({ id: 'dup-id' })]),
  })
  const id = runtime.config.gateParseResult.gates[0].id
  assert.equal(id, 'dup-id-3')
})

test('duplicates inside one batch are resolved deterministically', async (t) => {
  const { runtime } = await runParse(t, {
    modelText: modelOutput([validGate({ id: 'same-id' }), validGate({ id: 'same-id' })]),
  })
  const result = runtime.config.gateParseResult
  assert.equal(result.status, 'ok')
  const ids = result.gates.map((gate) => gate.id)
  assert.equal(new Set(ids).size, 2, 'batch ids must be unique')
  assert.ok(ids.includes('same-id'))
  assert.ok(ids.includes('same-id-2'))
})

// ---------------------------------------------------------------------------
// Request governance: nonce dedupe, TTL, single-flight, cancel
// ---------------------------------------------------------------------------

test('a nonce that was already handled is not parsed twice', async (t) => {
  const { runtime } = await runParse(t, { nonce: 'dedupe01' })
  assert.equal(runtime.stats.llmCalls, 1)
  const completedAt = runtime.config.gateParseResult.completedAt

  runtime.config.gateParseRequest = { nonce: 'dedupe01', text: '重新发送', at: Date.now() }
  await runtime.emit()
  await runtime.settle(200)

  assert.equal(runtime.stats.llmCalls, 1, 'a handled nonce must be ignored')
  assert.equal(runtime.config.gateParseResult.completedAt, completedAt, 'the result is not rewritten')
  assert.equal(runtime.stats.gateWrites, 0)
})

test('a request older than 120 seconds is stale-request and never reaches the model', async (t) => {
  const { runtime, done } = await runParse(t, {
    nonce: 'stale01',
    at: Date.now() - 121_000,
  })
  assert.equal(done, true)
  assert.equal(runtime.config.gateParseResult.status, 'error')
  assert.equal(runtime.config.gateParseResult.code, 'stale-request')
  assert.equal(runtime.stats.llmCalls, 0)
  assert.equal(runtime.stats.gateWrites, 0)
  assert.deepEqual(runtime.config.gates, [])
  assert.equal(runtime.config.gateParseRequest.nonce, '')
})

test('a request just inside the 120 second window is still parsed', async (t) => {
  const { runtime } = await runParse(t, { nonce: 'fresh01', at: Date.now() - 60_000 })
  assert.equal(runtime.config.gateParseResult.status, 'ok')
  assert.equal(runtime.stats.llmCalls, 1)
})

test('a second request preempts the in-flight one: newest nonce wins, old stream aborts', async (t) => {
  const control = controlledStream()
  control.chunks = [{ type: 'text-delta', text: modelOutput([validGate({ id: 'first-gate' })]) }, { type: 'finish' }]
  const runtime = setup(t, {
    nonce: 'first001',
    stream(options, stats) {
      if (stats.llmCalls === 1) return control.stream(options)
      return immediateStream([modelOutput([validGate({ id: 'second-gate' })])])(options)
    },
  })
  await runtime.emit()
  assert.equal(await runtime.waitFor(() => control.started), true, 'the first stream must start')

  runtime.config.gateParseRequest = { nonce: 'second02', text: '新的需求', at: Date.now() }
  await runtime.emit()
  assert.equal(await runtime.waitResult(), true)
  await runtime.settle(200)

  assert.equal(runtime.stats.llmCalls, 2)
  assert.equal(control.aborted, true, 'the superseded stream must be aborted')
  const result = runtime.config.gateParseResult
  assert.equal(result.nonce, 'second02')
  assert.equal(result.status, 'ok')
  assert.equal(result.gates[0].id, 'second-gate')
  assert.equal(runtime.stats.gateWrites, 0)
})

test('clearing the request mid-flight discards the in-flight result', async (t) => {
  const control = controlledStream()
  control.chunks = [{ type: 'text-delta', text: modelOutput([validGate({ id: 'discard-me' })]) }, { type: 'finish' }]
  const runtime = setup(t, { nonce: 'cancel01', stream: (options) => control.stream(options) })
  await runtime.emit()
  assert.equal(await runtime.waitFor(() => control.started), true)

  // The client cancels: both parse fields are cleared atomically.
  runtime.config.gateParseRequest = emptyRequest()
  runtime.config.gateParseResult = emptyResult()
  await runtime.emit()
  control.unblock()
  await runtime.settle(250)

  const result = runtime.config.gateParseResult
  assert.notEqual(result.status, 'ok', 'a cancelled parse must not produce an ok result')
  assert.doesNotMatch(JSON.stringify(result), /discard-me/, 'the discarded gate must not surface')
  assert.equal(runtime.stats.gateWrites, 0)
  assert.deepEqual(runtime.config.gates, [])
  assert.equal(control.aborted, true, 'the host aborts the stream on cancel')
  assert.equal(runtime.config.gateParseRequest.nonce, '', 'cancel leaves no pending request behind')
})

test('a nonce that is already the current result is not re-parsed', async (t) => {
  const { runtime } = await runParse(t, { nonce: 'same-result' })
  const writes = runtime.stats.resultWrites
  runtime.config.gateParseRequest = { nonce: 'same-result', text: 'again', at: Date.now() }
  await runtime.emit()
  await runtime.settle(200)
  assert.equal(runtime.stats.llmCalls, 1)
  assert.equal(runtime.stats.resultWrites, writes)
})

// ---------------------------------------------------------------------------
// Failure injection: unavailable services, stream errors, timeout, persistence
// ---------------------------------------------------------------------------

test('a missing llm service yields llm-unavailable without throwing', async (t) => {
  const { runtime, result } = await expectError(t, '', 'llm-unavailable', { noLlm: true })
  assert.equal(runtime.stats.llmCalls, 0)
  assert.equal(runtime.config.gateParseRequest.nonce, '')
  assert.ok(typeof result.detail === 'string')
})

test('a missing default-model service yields no-route without throwing', async (t) => {
  const { runtime } = await expectError(t, '', 'no-route', { noDefaultModel: true })
  assert.equal(runtime.stats.llmCalls, 0)
})

test('an empty default-model selection yields no-route', async (t) => {
  const { runtime } = await expectError(t, '', 'no-route', { selection: null })
  assert.equal(runtime.stats.llmCalls, 0)
})

test('a throwing stream yields llm-error and no gates', async (t) => {
  const rejections = collectUnhandledRejections(t)
  const { runtime } = await expectError(t, '', 'llm-error', {
    stream: async function* stream() {
      throw new Error('provider exploded')
    },
  })
  assert.equal(runtime.stats.gateWrites, 0)
  assert.equal(runtime.config.gateParseResult.gates.length, 0)
  assert.deepEqual(rejections, [], 'the host must catch the stream error')
})

test('a stream error chunk yields llm-error and keeps the provider diagnostic', async (t) => {
  const { runtime, result } = await expectError(t, '', 'llm-error', {
    stream: async function* stream() {
      yield { type: 'finish', kind: 'error', failure: { code: 'RATE_LIMIT', message: 'slow down' } }
    },
  })
  assert.match(result.detail, /RATE_LIMIT|slow down|rate/i, 'detail carries the provider diagnostic')
  assert.ok(result.detail.length <= 500)
  assert.equal(runtime.stats.gateWrites, 0)
})

test('an over-long provider diagnostic is truncated to 500 characters, not fatal', async (t) => {
  const { result } = await expectError(t, '', 'llm-error', {
    stream: async function* stream() {
      yield { type: 'finish', kind: 'error', failure: { code: 'PROVIDER_CRASH', message: 'm'.repeat(4000) } }
    },
  })
  assert.ok(result.detail.length <= 500, `detail must be <=500 chars, got ${result.detail.length}`)
})

test('a stream that never finishes yields timeout and aborts the stream', async (t) => {
  const control = controlledStream()
  const rejections = collectUnhandledRejections(t)
  const startedAt = Date.now()
  const { runtime, done } = await runParse(t, {
    nonce: 'timeout1',
    options: { timeoutMs: 40 },
    stream: (options) => control.stream(options),
    resultTimeout: 4000,
  })
  assert.equal(done, true, 'timeout must settle with a result')
  const elapsed = Date.now() - startedAt
  assert.ok(elapsed < 3000, `timeout must not wait the full 45s in this test (took ${elapsed}ms)`)
  const result = runtime.config.gateParseResult
  assert.equal(result.status, 'error')
  assert.equal(result.code, 'timeout')
  assert.equal(control.aborted, true, 'the abort signal must fire')
  assert.equal(runtime.stats.gateWrites, 0)
  assert.deepEqual(rejections, [])
})

test('a configEditor failure never throws, never writes gates, and keeps the request for retry', async (t) => {
  const rejections = collectUnhandledRejections(t)
  const control = immediateStream([modelOutput([validGate()])])
  const runtime = setup(t, {
    nonce: 'persist1',
    stream: (options) => control(options),
    failEdit: (call) => call === 1,
  })
  await runtime.emit()
  assert.equal(await runtime.waitFor(() => runtime.stats.edits >= 1, { timeout: 3000 }), true)
  await runtime.settle(300)

  assert.equal(runtime.stats.gateWrites, 0)
  assert.deepEqual(runtime.config.gates, [])
  assert.equal(runtime.config.gateParseRequest.nonce, 'persist1', 'the request is preserved for the next event')
  assert.equal(runtime.config.gateParseResult.status, '', 'a failed atomic edit cannot project a result')
  assert.deepEqual(rejections, [], 'a persistence failure must be caught')
})

test('persist-failed is recorded in the audit when the atomic result write fails (not client-visible)', async (t) => {
  // Contract §5.8/§5.6: the parser writes request-clear + result in ONE atomic
  // edit. If that edit throws there is no way to project a result (a second
  // write would fail the same way), so `persist-failed` is an audit/warn-only
  // code and is unreachable through the Config handshake. This test pins the
  // observable part of that decision.
  const home = await tempHome(t)
  const runtime = setup(t, {
    nonce: 'persist2',
    stream: (options) => immediateStream([modelOutput([validGate()])])(options),
    failEdit: (call) => call === 1,
  })
  await runtime.emit()
  assert.equal(await runtime.waitFor(() => runtime.stats.edits >= 1, { timeout: 3000 }), true)
  await runtime.settle(300)

  assert.equal(runtime.config.gateParseResult.status, '', 'persist-failed must not be projected into Config')
  assert.equal(runtime.stats.gateWrites, 0)
  assert.deepEqual(runtime.config.gates, [])
  const lines = (await fs.readFile(auditPaths(home).current, 'utf8')).trim().split(/\r?\n/)
  const entry = JSON.parse(lines.at(-1))
  assert.equal(entry.code, 'persist-failed')
  assert.equal(entry.nonce, 'persist2')
})

test('a failed result write is retried without calling the model again (v4)', async (t) => {
  const runtime = setup(t, {
    nonce: 'retry01',
    options: { retryDelaysMs: [0, 0, 0] },
    failEdit: (call) => call === 1,
  })
  await runtime.emit()
  assert.equal(await runtime.waitFor(() => runtime.stats.edits >= 1), true)
  assert.equal(runtime.stats.llmCalls, 1, 'the model runs once')

  await runtime.parser.check()
  assert.equal(await runtime.waitResult(), true, 'the retried write stores the cached result')
  assert.equal(runtime.stats.llmCalls, 1, 'the retry must not call llm.stream again')
  assert.equal(runtime.config.gateParseResult.status, 'ok')
  assert.equal(runtime.config.gateParseRequest.nonce, '')
})

test('failed writes back off at 30/60/120s, cap at four attempts, then give up (v4 D8)', async (t) => {
  const home = await tempHome(t)
  let clock = Date.now()
  const runtime = setup(t, {
    nonce: 'backoff1',
    options: { retryDelaysMs: [30_000, 60_000, 120_000], now: () => clock },
    failEdit: () => true,
  })
  await runtime.emit()
  assert.equal(await runtime.waitFor(() => runtime.stats.edits === 1), true)

  // Inside the first cooldown: check() must observe but not write again.
  await runtime.parser.check()
  assert.equal(runtime.stats.edits, 1)
  clock += 29_999
  await runtime.parser.check()
  assert.equal(runtime.stats.edits, 1, 'the 30s cooldown is honoured')

  clock += 1 // t=30s
  await runtime.parser.check()
  assert.equal(runtime.stats.edits, 2, 'first retry after 30s')
  clock += 59_999
  await runtime.parser.check()
  assert.equal(runtime.stats.edits, 2, 'the 60s cooldown is honoured')
  clock += 1 // t=90s
  await runtime.parser.check()
  assert.equal(runtime.stats.edits, 3, 'second retry after 60s')
  clock += 119_999
  await runtime.parser.check()
  assert.equal(runtime.stats.edits, 3, 'the 120s cooldown is honoured')
  clock += 1 // t=210s
  await runtime.parser.check()
  assert.equal(runtime.stats.edits, 4, 'third and final retry after 120s')

  // Exhausted: no further writes, no model re-run, no throw.
  clock += 1_000_000
  await runtime.parser.check()
  assert.equal(runtime.stats.edits, 4, 'at most four write attempts in total')
  assert.equal(runtime.stats.llmCalls, 1, 'retries never re-run the model')
  assert.equal(runtime.config.gateParseRequest.nonce, 'backoff1', 'the request stays pending after give-up')
  assert.equal(runtime.config.gateParseResult.status, '')

  const warnings = runtime.stats.warns.join('\n')
  assert.match(warnings, /gave up|give up|exhaust/i, 'giving up is logged as a warning')
  const records = (await fs.readFile(auditPaths(home).current, 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line))
  assert.ok(records.some((entry) => entry.code === 'persist-failed'), 'persist failures are audited')
  assert.ok(records.every((entry) => entry.nonce === 'backoff1'))
})

test('a missing configEditor cannot write a result but must not throw', async (t) => {
  const rejections = collectUnhandledRejections(t)
  const runtime = setup(t, { nonce: 'noeditor', noEditor: true })
  await runtime.emit()
  await runtime.settle(300)
  assert.equal(runtime.config.gateParseResult.status, '')
  assert.equal(runtime.stats.gateWrites, 0)
  assert.deepEqual(runtime.config.gates, [])
  assert.deepEqual(rejections, [])
})

// ---------------------------------------------------------------------------
// Audit trail (§5.7): append, content, rotation, tolerant failure
// ---------------------------------------------------------------------------

async function tempHome(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atr-gate-parse-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = dir
  t.after(async () => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await fs.rm(dir, { recursive: true, force: true })
  })
  return dir
}

function auditPaths(home) {
  const dir = path.join(home, 'agent-team-roles')
  return {
    dir,
    current: path.join(dir, 'gate-parse-audit.jsonl'),
    rotated: path.join(dir, 'gate-parse-audit.1.jsonl'),
  }
}

test('each parse appends one audit line with the exact input and output', async (t) => {
  const home = await tempHome(t)
  const text = '审核通过后才允许继续'
  const gate = validGate({ id: 'audit-gate' })
  const output = modelOutput([gate], 'assumption')
  const { runtime } = await runParse(t, {
    text,
    nonce: 'audit001',
    modelText: output,
  })
  assert.equal(runtime.config.gateParseResult.status, 'ok')

  const file = auditPaths(home).current
  const lines = (await fs.readFile(file, 'utf8')).trim().split(/\r?\n/)
  assert.equal(lines.length, 1, 'one line per parse')
  const entry = JSON.parse(lines[0])
  assert.ok(entry.at > 0)
  assert.equal(entry.nonce, 'audit001')
  assert.equal(entry.provider, 'test-provider')
  assert.equal(entry.model, 'test-model')
  assert.equal(entry.purpose, PURPOSE)
  assert.ok(entry.system.includes('workflow gate') || entry.system.length > 0)
  assert.ok(entry.input.includes(text), 'the exact user input is recorded')
  assert.ok(entry.input.includes('existing gate ids') || entry.input.length > 0)
  assert.ok(entry.output.includes('audit-gate'), 'the exact model output is recorded')
  assert.equal(entry.code, '')
})

test('failed parses are audited too', async (t) => {
  const home = await tempHome(t)
  const { runtime } = await runParse(t, {
    nonce: 'auditfail',
    stream: async function* stream() {
      yield { type: 'finish', kind: 'error', failure: { code: 'AUTH', message: 'bad key' } }
    },
  })
  assert.equal(runtime.config.gateParseResult.code, 'llm-error')
  const lines = (await fs.readFile(auditPaths(home).current, 'utf8')).trim().split(/\r?\n/)
  assert.equal(lines.length, 1)
  const entry = JSON.parse(lines[0])
  assert.equal(entry.code, 'llm-error')
  assert.equal(entry.nonce, 'auditfail')
})

test('the audit log rotates to .1 when it exceeds 1 MiB', async (t) => {
  const home = await tempHome(t)
  const paths = auditPaths(home)
  await fs.mkdir(paths.dir, { recursive: true })
  const oversized = `${'x'.repeat(1024 * 1024 + 32)}\n`
  await fs.writeFile(paths.current, oversized, 'utf8')

  const { runtime } = await runParse(t, { nonce: 'rotate1' })
  assert.equal(runtime.config.gateParseResult.status, 'ok')

  const rotated = await fs.readFile(paths.rotated, 'utf8')
  assert.equal(rotated, oversized, 'the old log is moved aside, not lost')
  const current = await fs.readFile(paths.current, 'utf8')
  assert.ok(Buffer.byteLength(current, 'utf8') < 1024 * 1024)
  const lines = current.trim().split(/\r?\n/)
  assert.equal(lines.length, 1)
  assert.equal(JSON.parse(lines[0]).nonce, 'rotate1')
})

test('an unwritable audit location only warns; the parse still succeeds', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atr-gate-block-'))
  const blocker = path.join(dir, 'blocked')
  await fs.writeFile(blocker, 'not a directory', 'utf8')
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = blocker
  t.after(async () => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await fs.rm(dir, { recursive: true, force: true })
  })

  const { runtime, done } = await runParse(t, { nonce: 'auditbad' })
  assert.equal(done, true)
  assert.equal(runtime.config.gateParseResult.status, 'ok', 'audit failure must not fail the parse')
  assert.equal(runtime.config.gateParseResult.gates.length, 1)
  assert.equal(runtime.stats.gateWrites, 0)
})

// ---------------------------------------------------------------------------
// Event payload compatibility and event-vs-poll sourcing (cr #18 / D5)
// ---------------------------------------------------------------------------

async function runWithPayload(t, nonce, payload) {
  // Start empty, let the startup microtask consume nothing, then write the
  // request and drive the parser ONLY through the event payload under test.
  const runtime = setup(t, { nonce: '', text: '' })
  await runtime.settle(20)
  runtime.config.gateParseRequest = { nonce, text: DEFAULT_TEXT, at: Date.now() }
  await runtime.emit(payload)
  const done = await runtime.waitResult({ timeout: 3000 })
  return { runtime, done }
}

test('the settings event accepts both a string namespace and an {ns} payload (cr #18)', async (t) => {
  const fromString = await runWithPayload(t, 'payload-s1', NS)
  assert.equal(fromString.done, true)
  assert.equal(fromString.runtime.config.gateParseResult.status, 'ok')

  const fromObject = await runWithPayload(t, 'payload-o2', { ns: NS })
  assert.equal(fromObject.done, true, 'an { ns } payload must trigger the same parse')
  assert.equal(fromObject.runtime.config.gateParseResult.status, 'ok')
})

test('a foreign namespace payload never starts a parse', async (t) => {
  const runtime = setup(t, { nonce: '', text: '' })
  await runtime.settle(20)
  runtime.config.gateParseRequest = { nonce: 'payload-x3', text: DEFAULT_TEXT, at: Date.now() }
  await runtime.emit('some-other-plugin')
  await runtime.settle(250)
  assert.equal(runtime.stats.llmCalls, 0)
  assert.equal(runtime.config.gateParseResult.status, '')
})

test('an event-triggered parse records source "event", not "poll" (D5)', async (t) => {
  const home = await tempHome(t)
  // Start with no pending request so the startup microtask has nothing to do.
  const runtime = setup(t, { nonce: '', text: '' })
  await runtime.settle(20)
  runtime.config.gateParseRequest = { nonce: 'source01', text: '当测试通过后才允许继续', at: Date.now() }
  await runtime.emit()
  assert.equal(await runtime.waitResult(), true)
  assert.equal(runtime.config.gateParseResult.status, 'ok')

  const lines = (await fs.readFile(auditPaths(home).current, 'utf8')).trim().split(/\r?\n/)
  const entry = JSON.parse(lines.at(-1))
  assert.equal(entry.source, 'event', 'the event path must own the parse, not the 1s poll')
  assert.equal(entry.nonce, 'source01')
})

test('an event arriving after the 1.5s startup window still owns the source (D5 no-race)', async (t) => {
  const home = await tempHome(t)
  const runtime = setup(t, { nonce: '', text: '' })
  await runtime.settle(50)
  // Pending request exists while the 1s poll and the 1.5s startup retry fire;
  // the delivery event then arrives late and must still own the audit source.
  runtime.config.gateParseRequest = { nonce: 'late-event', text: DEFAULT_TEXT, at: Date.now() }
  await runtime.settle(1700)
  await runtime.emit()
  assert.equal(await runtime.waitResult({ timeout: 5000 }), true)
  assert.equal(runtime.config.gateParseResult.status, 'ok')

  const records = (await fs.readFile(auditPaths(home).current, 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.nonce === 'late-event')
  assert.ok(records.length >= 1, 'the parse must be audited')
  for (const entry of records) {
    assert.equal(entry.source, 'event', `late event must not be stolen by a poll (got ${entry.source})`)
  }
})

// ---------------------------------------------------------------------------
// Response shape hygiene
// ---------------------------------------------------------------------------

test('the result never carries the raw requirement text', async (t) => {
  const text = '这句原始需求不应出现在结果字段里'
  const { runtime } = await runParse(t, {
    text,
    modelText: modelOutput([validGate({ description: '不同的描述' })], '不同的说明'),
  })
  const result = runtime.config.gateParseResult
  assert.equal(result.status, 'ok')
  assert.doesNotMatch(JSON.stringify(result), /这句原始需求不应出现在结果字段里/)
  assert.equal(runtime.config.gateParseRequest.text, '')
})

test('the result gates count is 1..5 for status=ok', async (t) => {
  const { runtime } = await runParse(t, { modelText: modelOutput([validGate()]) })
  const result = runtime.config.gateParseResult
  assert.equal(result.status, 'ok')
  assert.ok(result.gates.length >= 1 && result.gates.length <= 5)
})

// ---------------------------------------------------------------------------
// HMR transaction safety: never write Config from inside the event stack
// ---------------------------------------------------------------------------

test('the settings event performs no Config write in its synchronous phase (HMR regression)', async (t) => {
  const runtime = setup(t, { nonce: '', text: '' })
  // Let the startup microtask run against the empty request.
  await runtime.settle(20)
  runtime.config.gateParseRequest = { nonce: 'hmr-sync', text: DEFAULT_TEXT, at: Date.now() }
  const handler = runtime.handlers.get('settings/document-updated')
  assert.equal(typeof handler, 'function')

  handler(NS)
  assert.equal(runtime.stats.edits, 0, 'no config write while the Host transaction is still open')
  assert.equal(runtime.stats.llmCalls, 0, 'the model call must also be scheduled off the event stack')

  assert.equal(await runtime.waitResult(), true)
  assert.equal(runtime.config.gateParseResult.status, 'ok')
})

test('a nested-transaction rejection is contained, audited, and recovered by a later write (HMR regression)', async (t) => {
  const home = await tempHome(t)
  const rejections = collectUnhandledRejections(t)
  let clock = Date.now()
  const runtime = setup(t, {
    nonce: 'hmr-nested',
    options: { retryDelaysMs: [60_000], now: () => clock },
    failEdit: (call) => (call === 1
      ? new Error('HMR transactions cannot be nested')
      : undefined),
  })
  await runtime.emit()
  assert.equal(await runtime.waitFor(() => runtime.stats.edits >= 1), true)
  await runtime.settle(80)

  assert.equal(runtime.stats.gateWrites, 0, 'the nested rejection must not write gates')
  assert.equal(runtime.config.gateParseResult.status, '', 'the failed write is not projected yet')
  const records = (await fs.readFile(auditPaths(home).current, 'utf8'))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line))
  const failure = records.find((entry) => entry.code === 'persist-failed')
  assert.ok(failure, 'the rejection is audited as persist-failed')
  assert.match(String(failure.detail), /HMR transactions cannot be nested/)

  clock += 60_000 // the backoff has elapsed; a later write must recover
  await runtime.parser.check()
  assert.equal(await runtime.waitResult(), true, 'a later scheduled write recovers the cached result')
  assert.equal(runtime.config.gateParseResult.status, 'ok')
  assert.equal(runtime.stats.llmCalls, 1, 'the recovery must not call the model again')
  assert.deepEqual(rejections, [], 'the nested rejection must not reach the Host as an unhandled error')
})

// ---------------------------------------------------------------------------
// v5 retry scheduling: single writer, cancel safety, poll lifecycle
// ---------------------------------------------------------------------------

test('a scheduled retry never resurrects a cancelled request (v5)', async (t) => {
  const runtime = setup(t, {
    nonce: 'cancel-retry',
    options: { retryDelaysMs: [200] },
    failEdit: (call) => call === 1,
  })
  await runtime.emit()
  assert.equal(await runtime.waitFor(() => runtime.stats.edits === 1), true)

  // The client cancels: both fields are cleared while a retry is scheduled.
  runtime.config.gateParseRequest = emptyRequest()
  runtime.config.gateParseResult = emptyResult()
  const editsAtCancel = runtime.stats.edits
  await runtime.emit()

  await runtime.settle(350) // let any scheduled retry fire
  await runtime.parser.check()
  await runtime.settle(100)

  assert.equal(runtime.stats.edits, editsAtCancel, 'a late retry must not write after cancellation')
  assert.equal(runtime.config.gateParseResult.status, '', 'a cancelled request must not receive a late result')
  assert.equal(runtime.config.gateParseRequest.nonce, '')
  assert.equal(runtime.stats.gateWrites, 0)
})

test('concurrent retry drives collapse into a single cached-result write (v5)', async (t) => {
  let clock = Date.now()
  const runtime = setup(t, {
    nonce: 'retry-conc',
    options: { retryDelaysMs: [10_000], now: () => clock },
    failEdit: (call) => call === 1,
  })
  await runtime.emit()
  assert.equal(await runtime.waitFor(() => runtime.stats.edits >= 1), true)
  const editsBefore = runtime.stats.edits
  clock += 10_000

  await Promise.all([runtime.parser.check(), runtime.parser.check(), runtime.parser.check()])
  await runtime.settle(80)

  assert.equal(runtime.stats.edits - editsBefore, 1, 're-entrant retries must collapse into exactly one write')
  assert.equal(runtime.stats.llmCalls, 1)
  assert.equal(runtime.config.gateParseResult.status, 'ok')
})

test('per-nonce retry timers fire at 30s/60s/120s without re-running the model (v5 D11)', async (t) => {
  let clock = Date.now()
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  const timers = []
  globalThis.setTimeout = (callback, ms) => {
    const handle = { callback, ms, cleared: false }
    timers.push(handle)
    return handle
  }
  globalThis.clearTimeout = (handle) => {
    if (handle !== null && typeof handle === 'object') handle.cleared = true
  }
  const flush = async () => {
    for (let index = 0; index < 48; index += 1) await Promise.resolve()
  }
  try {
    const runtime = setup(t, {
      nonce: '',
      text: '',
      options: { retryDelaysMs: [30_000, 60_000, 120_000], now: () => clock },
      failEdit: (call) => call <= 3,
    })
    await flush() // startup microtask sees no request
    runtime.config.gateParseRequest = { nonce: 'timer-retry', text: DEFAULT_TEXT, at: Date.now() }
    await runtime.parser.check()
    assert.equal(runtime.stats.edits, 1, 'the first write fails')

    const delays = []
    for (const [index, delay] of [30_000, 60_000, 120_000].entries()) {
      const timer = timers.find((handle) => handle.ms === delay && handle.cleared === false)
      assert.ok(timer, `retry #${index + 1} must be scheduled at ${delay}ms`)
      delays.push(timer.ms)
      clock += delay
      timer.callback()
      // Audit appends are real fs I/O; yield to the real event loop (fake
      // setTimeout must not be used here) before checking the next schedule.
      await new Promise((resolve) => realSetTimeout(resolve, 25))
      await flush()
    }

    assert.deepEqual(delays, [30_000, 60_000, 120_000])
    assert.equal(runtime.stats.edits, 4, 'one initial write plus three retries')
    assert.equal(runtime.stats.llmCalls, 1, 'timed retries must reuse the cached result')
    assert.equal(runtime.config.gateParseResult.status, 'ok')
    assert.equal(runtime.config.gateParseRequest.nonce, '')
  } finally {
    try {
      // Dispose while the fake timers are still installed.
      globalThis.clearTimeout = realClearTimeout
    } catch {
      // ignore
    }
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
  }
})

test('a successful parse stops the fallback poll immediately (v5 D8)', async (t) => {
  const realSetInterval = globalThis.setInterval
  const realClearInterval = globalThis.clearInterval
  const intervals = []
  globalThis.setInterval = (callback, ms) => {
    const handle = { callback, ms, cleared: false }
    intervals.push(handle)
    return handle
  }
  globalThis.clearInterval = (handle) => {
    if (handle !== null && typeof handle === 'object') handle.cleared = true
  }
  try {
    const runtime = setup(t, { nonce: 'poll-stop' })
    await runtime.emit()
    assert.equal(await runtime.waitResult(), true)
    const poll = intervals.find((handle) => handle.ms === 1000)
    if (poll !== undefined) {
      assert.equal(poll.cleared, true, 'the poll stops as soon as the result is written')
    } else {
      assert.equal(intervals.length, 0, 'the event path must not leave a fallback poll armed')
    }
  } finally {
    globalThis.setInterval = realSetInterval
    globalThis.clearInterval = realClearInterval
  }
})

// ---------------------------------------------------------------------------
// Prompt contract: the model must receive both shell ids (v5 §5.4/§5.5)
// ---------------------------------------------------------------------------

test('the prompt hands the model both shell ids, not only the platform shell', async (t) => {
  const { runtime } = await runParse(t, { text: 'neutral requirement' })
  const options = runtime.stats.llmOptions[0]
  const user = options.messages[0].content.map((part) => part.text ?? '').join('\n')
  assert.match(user, /shell tool ids:\s*\["bash","pwsh"\]/, 'both shell ids must be listed verbatim')
  assert.match(user, /platform shell tool:\s*(?:bash|pwsh)/, 'the platform shell is named separately')
  const fullPrompt = `${options.system}\n${user}`
  assert.match(fullPrompt, /\bbash\b/)
  assert.match(fullPrompt, /\bpwsh\b/)
})
