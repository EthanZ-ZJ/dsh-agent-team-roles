import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GENERAL_ROLE,
  mergeRoles,
  normalizeRole,
  roleForTarget,
  validateRole,
  readConfig,
} from '../src/config.js'

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
