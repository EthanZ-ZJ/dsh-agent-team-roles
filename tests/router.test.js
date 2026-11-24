import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ROUTER_MODES,
  buildRouterPrompt,
  parseRouterReply,
  routeTask,
  routerPolicy,
  ruleRoute,
} from '../src/router.js'

const ROLES = [
  { id: 'general', name: 'General', description: 'General-purpose teammate.', tools: [] },
  { id: 'dev', name: 'DEV', description: 'Implements code against the SE contract; frontend and UI work.', tools: ['read', 'write', 'edit', 'pwsh'] },
  { id: 'tse', name: 'TSE', description: 'Designs tests and verifies flows; regression and acceptance.', tools: ['read', 'write'] },
  { id: 'cicd', name: 'CI/CD', description: 'Releases, deploys, and rolls back production.', tools: ['pwsh'] },
  { id: 'se', name: 'SE', description: 'Architecture, interfaces, contracts, and ADRs.', tools: ['read', 'write'] },
  { id: 'cr', name: 'CR', description: 'Reviews diffs against the contract.', tools: ['read'] },
]

test('routerPolicy returns the documented defaults for empty or invalid values', () => {
  assert.deepEqual(routerPolicy(), {
    mode: 'model',
    provider: '',
    model: '',
    reasoningEffort: '',
    timeoutMs: 20000,
    maxTokens: 800,
  })
  assert.deepEqual(routerPolicy({ mode: 'nope', timeoutMs: 0, maxTokens: -5 }), {
    mode: 'model',
    provider: '',
    model: '',
    reasoningEffort: '',
    timeoutMs: 20000,
    maxTokens: 800,
  })
  assert.deepEqual(routerPolicy({ mode: 'rules', provider: ' p ', model: ' m ', reasoningEffort: ' high ', timeoutMs: 5000, maxTokens: 100 }), {
    mode: 'rules',
    provider: 'p',
    model: 'm',
    reasoningEffort: 'high',
    timeoutMs: 5000,
    maxTokens: 100,
  })
  assert.deepEqual(ROUTER_MODES, ['model', 'rules', 'off'])
})

test('buildRouterPrompt renders the catalog line format and one user message', () => {
  const { system, messages } = buildRouterPrompt({
    task: 'Fix the login page',
    context: 'The user reports a CSS bug.',
    roles: [
      { id: 'dev', name: 'DEV', description: 'Builds UI', tools: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] },
      { id: 'cr', name: 'CR', description: 'Reviews diffs', tools: [] },
    ],
    members: ['dev-2'],
  })
  assert.match(system, /- dev \(DEV\): Builds UI; tools: a, b, c, d, e, f, g, h$/m)
  assert.match(system, /- cr \(CR\): Reviews diffs; tools: $/m)
  assert.ok(!system.includes('i, '), 'only the first eight tools are listed')
  assert.match(system, /roleId/)
  assert.match(system, /needsSplit/)
  assert.match(system, /Active teammates \(reuse when suitable\): dev-2/)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].role, 'user')
  assert.equal(messages[0].content[0].type, 'text')
  assert.match(messages[0].content[0].text, /Task:\nFix the login page/)
  assert.match(messages[0].content[0].text, /Context:\nThe user reports a CSS bug\./)
})

test('parseRouterReply tolerates fences and surrounding text', () => {
  const reply = 'Here is the decision:\n```json\n{"roleId":"dev","confidence":1.8,"reason":"frontend work","needsSplit":[{"roleId":"tse","task":"test it"},{"roleId":"ghost","task":"drop"},{"roleId":"cr","task":"  "}]}```\nThanks.'
  const parsed = parseRouterReply(reply, ['dev', 'tse', 'cr'])
  assert.deepEqual(parsed, {
    roleId: 'dev',
    confidence: 1,
    reason: 'frontend work',
    suggestedTaskPrompt: '',
    needsSplit: [{ roleId: 'tse', task: 'test it' }],
  })
})

test('parseRouterReply clamps confidence, truncates reasons, and rejects invalid replies', () => {
  const low = parseRouterReply('{"roleId":"dev","confidence":-3,"reason":"' + 'x'.repeat(300) + '"}', ['dev'])
  assert.equal(low.confidence, 0)
  assert.equal(low.reason.length, 200)
  const missing = parseRouterReply('{"roleId":"dev"}', ['dev'])
  assert.equal(missing.confidence, 0)
  assert.deepEqual(missing.needsSplit, [])

  assert.throws(() => parseRouterReply('not json at all', ['dev']), /no JSON object/)
  assert.throws(() => parseRouterReply('{"roleId":"ghost","confidence":0.5}', ['dev']), /unknown role/)
  assert.throws(() => parseRouterReply('{"roleId":', ['dev']), /unbalanced JSON/)
  assert.throws(() => parseRouterReply('{"roleId":"dev"}', undefined), /unknown role/)
})

test('ruleRoute maps built-in keywords and falls back in catalog order', () => {
  assert.equal(ruleRoute({ task: '修复前端页面样式', roles: ROLES }).roleId, 'dev')
  assert.equal(ruleRoute({ task: '补一轮回归和验收测试', roles: ROLES }).roleId, 'tse')
  assert.equal(ruleRoute({ task: '部署上线并准备回退', roles: ROLES }).roleId, 'cicd')
  assert.equal(ruleRoute({ task: 'review this diff', roles: ROLES }).roleId, 'cr')
  // No hit at all: `general` wins when present.
  const noHit = ruleRoute({ task: 'unrelated words only', roles: ROLES })
  assert.equal(noHit.roleId, 'general')
  assert.equal(noHit.confidence, 0.2)
  const withoutGeneral = ruleRoute({ task: 'unrelated words only', roles: ROLES.filter((role) => role.id !== 'general') })
  assert.equal(withoutGeneral.roleId, 'dev', 'the first catalog role wins when no hit and no general exists')
})

test('ruleRoute scores catalog tokens and keeps catalog order on a tie', () => {
  const roles = [
    { id: 'alpha', name: 'Alpha', description: 'pipeline expert', tools: ['bash'] },
    { id: 'beta', name: 'Beta', description: 'pipeline expert', tools: ['bash'] },
  ]
  const result = ruleRoute({ task: 'pipeline bash', roles })
  assert.equal(result.roleId, 'alpha', 'equal scores keep catalog order')
  assert.match(result.reason, /matched:/)
  // The domain keyword beats a plain token hit for its mapped role.
  const mapped = ruleRoute({ task: '前端 pipeline', roles: [
    { id: 'alpha', name: 'Alpha', description: 'pipeline', tools: [] },
    { id: 'dev', name: 'DEV', description: 'frontend', tools: [] },
  ] })
  assert.equal(mapped.roleId, 'dev')
})

test('routeTask fails when routing is off and uses rules when no model route exists', async () => {
  await assert.rejects(
    () => routeTask({ task: 'x', roles: ROLES, policy: { mode: 'off' } }),
    /routing is disabled/,
  )
  await assert.rejects(
    () => routeTask({ task: 'x', roles: [], policy: { mode: 'off' } }),
    /routing is disabled/,
    'the off mode wins even without a catalog',
  )
  const ruled = await routeTask({ task: '修复前端页面', roles: ROLES, policy: { mode: 'model', provider: '', model: '' } })
  assert.equal(ruled.roleId, 'dev')
  assert.equal(ruled.source, 'rules')
  assert.equal(typeof ruled.latencyMs, 'number')
  assert.equal(ruled.suggestedTaskPrompt, '修复前端页面')

  let called = false
  const explicit = await routeTask({
    task: '部署上线',
    roles: ROLES,
    policy: { mode: 'rules', provider: 'p', model: 'm' },
    callModel: async () => { called = true; return '{}' },
  })
  assert.equal(called, false, 'rules mode never calls the model')
  assert.equal(explicit.roleId, 'cicd')
  assert.equal(explicit.source, 'rules')
})

test('routeTask returns a model decision when the injected call succeeds', async () => {
  const calls = []
  const decision = await routeTask({
    task: 'fix login',
    context: 'frontend',
    roles: ROLES,
    members: ['dev-1'],
    policy: { mode: 'model', provider: 'openai', model: 'router', reasoningEffort: 'low', timeoutMs: 5000, maxTokens: 123 },
    callModel: async ({ system, messages, policy }) => {
      calls.push({ system, messages, policy })
      return '{"roleId":"dev","confidence":0.87,"reason":"frontend","suggestedTaskPrompt":"Fix the login page","needsSplit":[{"roleId":"tse","task":"regression"}]}'
    },
  })
  assert.equal(calls.length, 1)
  assert.match(calls[0].system, /Role catalog/)
  assert.equal(calls[0].messages[0].role, 'user')
  assert.deepEqual(calls[0].policy, {
    mode: 'model', provider: 'openai', model: 'router', reasoningEffort: 'low', timeoutMs: 5000, maxTokens: 123,
  })
  assert.deepEqual(decision, {
    roleId: 'dev',
    confidence: 0.87,
    reason: 'frontend',
    suggestedTaskPrompt: 'Fix the login page',
    needsSplit: [{ roleId: 'tse', task: 'regression' }],
    source: 'model',
    model: 'openai/router',
    latencyMs: decision.latencyMs,
  })
  assert.equal(typeof decision.latencyMs, 'number')
})

test('routeTask falls back to rules on a thrown, malformed, or timed-out model call', async () => {
  const base = {
    task: '修复前端页面',
    roles: ROLES,
    policy: { mode: 'model', provider: 'p', model: 'm', timeoutMs: 20 },
  }
  const thrown = await routeTask({ ...base, callModel: async () => { throw new Error('boom') } })
  assert.equal(thrown.roleId, 'dev')
  assert.equal(thrown.source, 'rules')
  assert.equal(thrown.model, undefined)

  const malformed = await routeTask({ ...base, callModel: async () => 'not a decision' })
  assert.equal(malformed.source, 'rules')

  const unknownRole = await routeTask({ ...base, callModel: async () => '{"roleId":"ghost","confidence":0.5}' })
  assert.equal(unknownRole.source, 'rules')
  assert.equal(unknownRole.roleId, 'dev')

  const timedOut = await routeTask({ ...base, callModel: () => new Promise(() => {}) })
  assert.equal(timedOut.source, 'rules')
  assert.equal(timedOut.roleId, 'dev')
})
