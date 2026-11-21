import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { normalizeRole, validateRole } from '../src/config.js'

const patch = fs.readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const preset = patch.slice(patch.indexOf('preset-team-lead'))

test('the bundle ships a Team Lead agent preset', () => {
  assert.match(preset, /name: '@deepseek-ai\/dsh-agent-preset'/)
  assert.match(preset, /id: team-lead/)
  assert.match(preset, /name: Team Lead/)
  assert.match(preset, /dsh-persona/)
  assert.match(preset, /dsh-tool-ask-user/)
  assert.match(preset, /dsh-compaction/)
  assert.match(preset, /wait_agent/)
  assert.match(preset, /并发派发/)
  assert.match(preset, /权限兜底/)
})

test('the Team Lead preset has fallback filesystem and shell tools', () => {
  assert.match(preset, /dsh-tool-fs/)
  assert.match(preset, /dsh-tool-fs-search/)
  assert.match(preset, /dsh-tool-pwsh/)
  assert.match(preset, /dsh-tool-bash/)
  assert.doesNotMatch(preset, /dsh-tool-(web|subagent|workflow)/)
  assert.doesNotMatch(preset, /dsh-skill-filesystem/)
})

test('the Lead persona is domain-neutral with generic scheduling discipline', () => {
  assert.match(preset, /wait_agent/)
  assert.match(preset, /并发派发/)
  assert.match(preset, /权限兜底/)
  assert.doesNotMatch(preset, /分工：/)
  assert.doesNotMatch(preset, /→ (PM|SE|DEV|TSE|CR)/)
})

test('the seeded leadPlaybook and software-dev template carry the domain flow', () => {
  assert.match(patch, /leadPlaybook: >-/)
  assert.match(patch, /activeTemplate: software-dev/)
  const template = JSON.parse(
    fs.readFileSync(new URL('../templates/software-dev/template.json', import.meta.url), 'utf8'),
  )
  assert.match(template.leadPlaybook, /CR（静态检视）与 TSE（动态测试）并行派发/)
  assert.match(template.leadPlaybook, /派回 DEV 修复 → 修复后重新走 CR\+TSE/)
  const roles = Object.fromEntries(template.roles.map((role) => [role.id, role]))
  const pushDeny = '\\bgit(\\.exe)?\\s+push\\b'
  // DEV may push: a workflow gate (checks-green-before-push) gates it instead of
  // an unconditional denyCommands block.
  assert.equal(roles.dev.denyCommands, undefined)
  assert.match(roles.dev.persona, /git push 由你执行/)
  assert.deepEqual(roles.tse.denyCommands, [pushDeny])
  assert.equal(roles.se.denyCommands, undefined)
  assert.equal(roles.cr.denyCommands, undefined)
  const pushGate = template.gates.find((gate) => gate.id === 'checks-green-before-push')
  assert.ok(pushGate, 'checks-green-before-push gate must exist')
  assert.equal(pushGate.deny.role, 'dev')
  assert.match(pushGate.deny.commandPattern, /push/)
})

/**
 * Parse the `config.roles` block of cordis.patch.yml.
 *
 * The plugin ships no YAML dependency, so this handles exactly the subset the
 * patch uses: `key: scalar`, folded (`>-`) persona blocks, and `- item` lists
 * at the fixed indents the file is written with. If the patch shape changes,
 * this parser — not the roles — is what to update.
 */
function parseRoles() {
  const lines = patch.split(/\r?\n/)
  const start = lines.findIndex((line) => line === '        roles:')
  const end = lines.findIndex((line) => line === '        rules: []')
  assert.ok(start >= 0 && end > start, 'patch must contain a config.roles block')
  const roles = []
  let current = null
  let mode = null
  for (const line of lines.slice(start + 1, end)) {
    const entry = line.match(/^          - id: (.+)$/)
    if (entry) {
      current = { id: entry[1], tools: [], skills: [] }
      roles.push(current)
      mode = null
      continue
    }
    if (current === null) continue
    const scalar = line.match(/^            ([A-Za-z]+): (.*)$/)
    if (scalar) {
      const [, key, raw] = scalar
      current[key] = raw === "''" ? '' : raw.replace(/^'|'$/g, '')
      mode = null
      continue
    }
    if (/^            persona: >-$/.test(line)) {
      current.persona = ''
      mode = 'persona'
      continue
    }
    if (/^            (tools|skills):$/.test(line)) {
      mode = line.trim().replace(':', '')
      continue
    }
    if (mode === 'persona' && /^              /.test(line)) {
      const text = line.trim()
      current.persona = current.persona === '' ? text : `${current.persona} ${text}`
      continue
    }
    if (mode !== null) {
      const item = line.match(/^              - (.+)$/)
      if (item) current[mode].push(item[1].trim())
    }
  }
  return roles
}

test('every built-in role passes validateRole', () => {
  const roles = parseRoles().map(normalizeRole)
  const ids = roles.map((role) => role.id).sort()
  assert.deepEqual(ids, ['cicd', 'cr', 'dev', 'general', 'pm', 'se', 'tse'])
  for (const role of roles) {
    assert.equal(validateRole(role), undefined, `role "${role.id}" must validate`)
  }
})

test('collaboration tools are whitelisted for every custom role', () => {
  for (const role of parseRoles().filter((role) => role.toolMode === 'custom')) {
    for (const tool of ['send_message', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update']) {
      assert.ok(role.tools.includes(tool), `role "${role.id}" must whitelist ${tool}`)
    }
  }
})

test('se and cr cannot run shells, and cr cannot write files', () => {
  const roles = Object.fromEntries(parseRoles().map((role) => [role.id, role]))
  for (const id of ['se', 'cr']) {
    for (const tool of ['pwsh', 'bash']) {
      assert.ok(!roles[id].tools.includes(tool), `role "${id}" must not whitelist ${tool}`)
    }
  }
  for (const tool of ['write', 'edit']) {
    assert.ok(!roles.cr.tools.includes(tool), `role "cr" must not whitelist ${tool}`)
  }
  for (const tool of ['write', 'edit']) {
    assert.ok(roles.se.tools.includes(tool), `role "se" must whitelist ${tool} for contract docs`)
  }
})
