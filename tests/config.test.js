import test from 'node:test'
import assert from 'node:assert/strict'
import z from '@deepseek-ai/schemastery'
import {
  GENERAL_ROLE,
  mergeRoles,
  normalizeRole,
  roleForTarget,
  validateRole,
  readConfig,
} from '../src/config.js'
import { Config } from '../src/plugin.js'

test('normalizeRole fills defaults and trims fields', () => {
  const role = normalizeRole({ id: ' reviewer ', name: ' Code reviewer ', tools: [' read ', 'read'] })
  assert.equal(role.id, 'reviewer')
  assert.equal(role.name, 'Code reviewer')
  assert.equal(role.toolMode, 'all')
  assert.deepEqual(role.tools, [])
})

test('fallback effort is trimmed independently and defaults to empty for legacy roles', () => {
  const role = normalizeRole({ id: 'dev', reasoningEffort: ' high ', fallbackReasoningEffort: ' low ' })
  assert.equal(role.reasoningEffort, 'high')
  assert.equal(role.fallbackReasoningEffort, 'low')
  assert.equal(normalizeRole({ id: 'dev', reasoningEffort: 'high' }).fallbackReasoningEffort, '')
})

test('mergeRoles always exposes the general fallback', () => {
  const roles = mergeRoles([{ id: 'reviewer', name: 'Reviewer' }])
  assert.deepEqual(roles.map((role) => role.id), ['general', 'reviewer'])
})

test('mergeRoles keeps an edited general role authoritative', () => {
  const roles = mergeRoles([{ id: 'general', name: 'Custom general', persona: 'Be brief.' }])
  assert.equal(roles.length, 1)
  assert.equal(roles[0].name, 'Custom general')
})

test('roleForTarget maps numeric instances back to their role', () => {
  const roles = mergeRoles([{ id: 'reviewer' }])
  assert.equal(roleForTarget(roles, 'reviewer')?.id, 'reviewer')
  assert.equal(roleForTarget(roles, 'reviewer-12')?.id, 'reviewer')
  assert.equal(roleForTarget(roles, 'reviewer-extra'), undefined)
})

test('validateRole rejects half-configured routes and empty custom policies', () => {
  assert.match(validateRole({ ...normalizeRole({ id: 'reviewer' }), provider: 'p' }), /both provider and model/)
  assert.match(
    validateRole({ ...normalizeRole({ id: 'reviewer' }), toolMode: 'custom' }),
    /lists no tools/,
  )
  assert.equal(validateRole(normalizeRole({ id: 'reviewer' })), undefined)
})

test('readConfig unwraps a volatile field', () => {
  const value = [{ id: 'general' }]
  assert.equal(readConfig({ roles: { get: () => value } }, 'roles'), value)
  assert.equal(readConfig({ roles: value }, 'roles'), value)
})

test('the built-in general role stays valid', () => {
  assert.equal(validateRole(normalizeRole(GENERAL_ROLE)), undefined)
})

test('fallback route must be configured as a pair', () => {
  const base = { ...GENERAL_ROLE, id: 'dev', fallbackProvider: 'p2', fallbackModel: 'm2' }
  assert.equal(validateRole(normalizeRole(base)), undefined)
  assert.match(
    validateRole(normalizeRole({ ...base, fallbackProvider: 'p2', fallbackModel: '' })),
    /both fallbackProvider and fallbackModel/,
  )
  assert.match(
    validateRole(normalizeRole({ ...base, fallbackProvider: '', fallbackModel: 'm2' })),
    /both fallbackProvider and fallbackModel/,
  )
})

test('the live Config schema exposes modelChainTemplates as an editable volatile field', () => {
  const field = Config.dict.modelChainTemplates
  // The settings Remote only surfaces and mutates a field reached through a
  // volatile node, so both the flag and the array default are part of the host
  // contract this field is persisted under.
  assert.equal(field?.type, 'array')
  assert.equal(field?.meta?.volatile, true)
  assert.deepEqual(field?.meta?.default, [])
})

test('a profile saved before model-chain templates existed reads back an empty list', () => {
  const config = Config({ roles: [{ id: 'dev', name: 'DEV' }], autoFallback: false })
  assert.deepEqual(readConfig(config, 'modelChainTemplates'), [])
  // Adding the field must not disturb settings that were already persisted.
  assert.equal(readConfig(config, 'autoFallback'), false)
  assert.equal(readConfig(config, 'roles')[0].id, 'dev')
})

test('modelChainTemplates round-trips names, primary routes, and ordered fallbacks', () => {
  const templates = [
    {
      name: '快速链',
      provider: 'deepseek',
      model: 'deepseek-chat',
      reasoningEffort: 'high',
      fallbacks: [
        { provider: 'openai', model: 'gpt-x', reasoningEffort: 'low' },
        { provider: 'anthropic', model: 'claude-y', reasoningEffort: '' },
      ],
    },
    { name: 'cheap', provider: 'local', model: 'qwen', reasoningEffort: '', fallbacks: [] },
  ]
  const resolved = readConfig(Config({ modelChainTemplates: templates }), 'modelChainTemplates')
  assert.deepEqual(resolved, templates)
})

test('a template entry only needs a name; every other field defaults', () => {
  const resolved = readConfig(Config({ modelChainTemplates: [{ name: 'minimal' }] }), 'modelChainTemplates')
  assert.deepEqual(resolved, [{
    name: 'minimal',
    provider: '',
    model: '',
    reasoningEffort: '',
    fallbacks: [],
  }])
})

test('saving templates preserves the rest of the persisted config across a JSON round trip', () => {
  const persisted = {
    roles: [{ id: 'dev', name: 'DEV', provider: 'deepseek', model: 'deepseek-chat' }],
    autoFallback: false,
    gatesDisabled: ['ship'],
  }
  const templates = [{
    name: 'primary',
    provider: 'p',
    model: 'm',
    reasoningEffort: 'high',
    fallbacks: [{ provider: 'p2', model: 'm2', reasoningEffort: '' }],
  }]
  // What the Settings Remote writes is plain JSON merged into the profile
  // patch; parse it twice to model a save followed by a cold read.
  const written = JSON.parse(JSON.stringify({ ...persisted, modelChainTemplates: templates }))
  const first = Config(written)
  const second = Config(JSON.parse(JSON.stringify(written)))
  assert.deepEqual(readConfig(first, 'modelChainTemplates'), templates)
  assert.deepEqual(readConfig(second, 'modelChainTemplates'), templates)
  assert.deepEqual(readConfig(second, 'roles'), readConfig(Config(persisted), 'roles'))
  assert.equal(readConfig(second, 'autoFallback'), false)
  assert.deepEqual(readConfig(second, 'gatesDisabled'), ['ship'])
})

test('modelChainTemplates keeps the host contract strict about its shape', () => {
  assert.throws(() => Config({ modelChainTemplates: 'primary' }), /expected array/)
  assert.throws(() => Config({ modelChainTemplates: [{ name: 'x', provider: 7 }] }), /expected string/)
})

test('the Config schema survives the settings Remote JSON projection', () => {
  // The settings Remote rebuilds every schema through toJSON(); the route
  // schema shared by roles and templates must expand correctly there.
  const form = new z(Config.toJSON())
  const templates = [{
    name: 'projected',
    provider: 'p',
    model: 'm',
    reasoningEffort: 'high',
    fallbacks: [{ provider: 'p2', model: 'm2', reasoningEffort: 'low' }],
  }]
  const resolved = form({
    modelChainTemplates: templates,
    roles: [{ id: 'dev', fallbacks: [{ provider: 'r', model: 'rm', reasoningEffort: '' }] }],
  })
  assert.deepEqual(readConfig(resolved, 'modelChainTemplates'), templates)
  assert.deepEqual(readConfig(resolved, 'roles')[0].fallbacks, [
    { provider: 'r', model: 'rm', reasoningEffort: '' },
  ])
})
