import test from 'node:test'
import assert from 'node:assert/strict'
import { compileDenyCommands, evaluateDeny } from '../src/policy.js'
import { normalizeRole, validateRole } from '../src/config.js'

const base = (input) => normalizeRole({ id: 'dev', toolMode: 'custom', tools: ['pwsh'], ...input })

test('denyCommands compiles valid patterns and skips junk defensively', () => {
  const role = base({ denyCommands: ['\\bgit\\s+push\\b', '', 42] })
  const compiled = compileDenyCommands(role)
  assert.equal(compiled.length, 1)
  assert.equal(compiled[0].pattern, '\\bgit\\s+push\\b')
  assert.equal(compileDenyCommands(undefined).length, 0)
})

test('evaluateDeny blocks matching shell commands with a readable reason', () => {
  const role = base({ denyCommands: ['\\bgit(\\.exe)?\\s+push\\b'] })
  const reason = evaluateDeny(role, 'pwsh', { command: 'git push origin master' })
  assert.match(reason, /role "dev"/)
  assert.match(reason, /denyCommands/)
  assert.match(reason, /delegate it through the Team Lead/)
  assert.match(evaluateDeny(role, 'bash', { command: 'git.exe push' }), /Command blocked by role policy/)
  assert.equal(evaluateDeny(role, 'pwsh', { command: 'git status' }), undefined)
})

test('evaluateDeny ignores non-shell tools and non-string commands', () => {
  const role = base({ denyCommands: ['push'] })
  assert.equal(evaluateDeny(role, 'read', { file_path: 'push' }), undefined)
  assert.equal(evaluateDeny(role, 'pwsh', { command: 42 }), undefined)
  assert.equal(evaluateDeny(role, 'pwsh', undefined), undefined)
  assert.equal(evaluateDeny(role, 'pwsh', { command: 'npm test' }), undefined)
})

test('evaluateDeny accepts a JSON-string arguments payload', () => {
  const role = base({ denyCommands: ['\\bgit\\s+push\\b'] })
  const args = JSON.stringify({ command: 'git push --force' })
  assert.match(evaluateDeny(role, 'bash', args), /Command blocked by role policy/)
})

test('normalizeRole keeps denyCommands; validateRole enforces bounds and compilability', () => {
  const valid = base({ denyCommands: ['\\bgit\\s+push\\b'] })
  assert.deepEqual(valid.denyCommands, ['\\bgit\\s+push\\b'])
  assert.equal(validateRole(valid), undefined)

  assert.match(validateRole(base({ denyCommands: Array.from({ length: 21 }, (_, i) => `a${i}`) })), /more than 20/)
  assert.match(validateRole(base({ denyCommands: ['x'.repeat(201)] })), /longer than 200/)
  assert.match(validateRole(base({ denyCommands: ['([bad'] })), /not a valid regex/)

  const stripped = base({})
  assert.deepEqual(stripped.denyCommands, [])
})
