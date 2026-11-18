import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  copyTemplateSkills,
  discoverTemplates,
  readTemplate,
  seedTemplates,
  upsertRoles,
} from '../src/templates.js'

const validTemplate = {
  id: 'software-dev',
  name: 'Software Development Team',
  description: 'Contract-driven development team.',
  leadPlaybook: 'Dispatch CR and TSE in parallel.',
  roles: [
    { id: 'dev', name: 'DEV', toolMode: 'custom', tools: ['read', 'pwsh'], denyCommands: ['\\bgit\\s+push\\b'] },
    { id: 'cr', name: 'CR', toolMode: 'custom', tools: ['read'] },
  ],
}

async function makeRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'dsh-templates-'))
}

async function writeTemplate(root, id, content) {
  const dir = path.join(root, id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'template.json'),
    typeof content === 'string' ? content : JSON.stringify(content),
  )
  return dir
}

test('readTemplate validates a well-formed template and normalizes roles', async () => {
  const root = await makeRoot()
  const dir = await writeTemplate(root, 'software-dev', validTemplate)
  const { template, error } = await readTemplate(dir)
  assert.equal(error, undefined)
  assert.equal(template.id, 'software-dev')
  assert.equal(template.leadPlaybook, 'Dispatch CR and TSE in parallel.')
  assert.deepEqual(template.roles.map((role) => role.id), ['dev', 'cr'])
  assert.deepEqual(template.roles[0].denyCommands, ['\\bgit\\s+push\\b'])
})

test('readTemplate skips broken templates with an error, never throwing', async () => {
  const root = await makeRoot()
  const brokenJson = await writeTemplate(root, 'broken-json', '{"id": "x",')
  assert.match((await readTemplate(brokenJson)).error, /invalid JSON|cannot read/)

  const badId = await writeTemplate(root, 'bad-id', { ...validTemplate, id: 'Not Valid' })
  assert.match((await readTemplate(badId)).error, /invalid template id/)

  const noRoles = await writeTemplate(root, 'no-roles', { id: 'no-roles', name: 'X', roles: [] })
  assert.match((await readTemplate(noRoles)).error, /non-empty array/)

  const badRole = await writeTemplate(root, 'bad-role', {
    id: 'bad-role',
    name: 'X',
    roles: [{ id: 'dev', toolMode: 'custom', tools: [] }],
  })
  assert.match((await readTemplate(badRole)).error, /role invalid/)

  const badRegex = await writeTemplate(root, 'bad-regex', {
    id: 'bad-regex',
    name: 'X',
    roles: [{ id: 'dev', toolMode: 'custom', tools: ['read'], denyCommands: ['([oops'] }],
  })
  assert.match((await readTemplate(badRegex)).error, /role invalid/)
})

test('readTemplate parses and validates gates alongside roles', async () => {
  const root = await makeRoot()
  const withGates = {
    ...validTemplate,
    gates: [{
      id: 'review-before-commit',
      deny: { role: 'dev', tool: ['bash', 'pwsh'], commandPattern: '\\bgit\\s+commit\\b' },
      require: { event: 'review-approved', byRoles: ['cr'], freshFor: 3600 },
      description: 'example',
    }],
  }
  const dir = await writeTemplate(root, 'with-gates', withGates)
  const { template, error } = await readTemplate(dir)
  assert.equal(error, undefined)
  assert.equal(template.gates.length, 1)
  assert.equal(template.gates[0].id, 'review-before-commit')

  const badGate = await writeTemplate(root, 'bad-gate', {
    ...validTemplate,
    id: 'bad-gate',
    gates: [{ id: 'bad-gate', deny: { role: 'dev', tool: ['bash'], commandPattern: '([bad' }, require: { event: 'x', byRoles: ['cr'] } }],
  })
  assert.match((await readTemplate(badGate)).error, /gate invalid/)

  const noGates = await writeTemplate(root, 'no-gates', { ...validTemplate, id: 'no-gates' })
  assert.deepEqual((await readTemplate(noGates)).template.gates, [])
})

test('discoverTemplates returns only valid templates sorted by id', async () => {
  const root = await makeRoot()
  await writeTemplate(root, 'b-template', { ...validTemplate, id: 'b-template', name: 'Beta' })
  await writeTemplate(root, 'a-template', { ...validTemplate, id: 'a-template', name: 'Alpha' })
  await writeTemplate(root, 'broken', '{"nope": true}')
  await fs.mkdir(path.join(root, 'empty-dir'), { recursive: true })

  const templates = await discoverTemplates(root)
  assert.deepEqual(templates.map((template) => template.id), ['a-template', 'b-template'])
})

test('seedTemplates copies missing dirs and never overwrites existing ones', async () => {
  const builtin = await makeRoot()
  const builtInDir = await writeTemplate(builtin, 'software-dev', validTemplate)
  await fs.mkdir(path.join(builtInDir, 'skills', 'dev'), { recursive: true })
  await fs.writeFile(path.join(builtInDir, 'skills', 'dev', 'SKILL.md'), 'builtin')

  const state = await makeRoot()
  const first = await seedTemplates(await fs.mkdtemp(path.join(os.tmpdir(), 'unused-')), builtin)
  void first
  const target = path.join(state, 'templates')
  const result = await seedTemplates(target, builtin)
  assert.deepEqual(result.seeded, ['software-dev'])
  const seededJson = await fs.readFile(path.join(target, 'software-dev', 'template.json'), 'utf8')
  assert.match(seededJson, /software-dev/)

  await fs.writeFile(path.join(target, 'software-dev', 'template.json'), '{"edited": true}')
  const second = await seedTemplates(target, builtin)
  assert.deepEqual(second.seeded, [])
  assert.match(await fs.readFile(path.join(target, 'software-dev', 'template.json'), 'utf8'), /edited/)
})

test('copyTemplateSkills merges role skill dirs without deleting unrelated files', async () => {
  const templateDir = await makeRoot()
  await fs.mkdir(path.join(templateDir, 'skills', 'dev'), { recursive: true })
  await fs.writeFile(path.join(templateDir, 'skills', 'dev', 'SKILL.md'), 'v2')
  await fs.mkdir(path.join(templateDir, 'skills', 'qa'), { recursive: true })
  await fs.writeFile(path.join(templateDir, 'skills', 'qa', 'SKILL.md'), 'qa')

  const skillsRoot = await makeRoot()
  await fs.mkdir(path.join(skillsRoot, 'dev'), { recursive: true })
  await fs.writeFile(path.join(skillsRoot, 'dev', 'SKILL.md'), 'v1')
  await fs.writeFile(path.join(skillsRoot, 'dev', 'KEEP.md'), 'keep me')

  const { copied } = await copyTemplateSkills(templateDir, skillsRoot)
  assert.deepEqual(copied.sort(), ['dev', 'qa'])
  assert.equal(await fs.readFile(path.join(skillsRoot, 'dev', 'SKILL.md'), 'utf8'), 'v2')
  assert.equal(await fs.readFile(path.join(skillsRoot, 'dev', 'KEEP.md'), 'utf8'), 'keep me')
  assert.equal(await fs.readFile(path.join(skillsRoot, 'qa', 'SKILL.md'), 'utf8'), 'qa')
})

test('upsertRoles creates missing roles and updates existing ones', async () => {
  const created = []
  const updated = []
  const store = {
    get: (id) => (id === 'existing' ? { id: 'existing' } : undefined),
    create: async (role) => created.push(role),
    update: async (id, patch) => updated.push([id, patch]),
  }
  const applied = await upsertRoles(store, [
    { id: 'existing', name: 'Updated' },
    { id: 'fresh', name: 'Created' },
  ])
  assert.deepEqual(applied, [
    { id: 'existing', action: 'updated' },
    { id: 'fresh', action: 'created' },
  ])
  assert.equal(created.length, 1)
  assert.deepEqual(updated[0], ['existing', { id: 'existing', name: 'Updated' }])
})

test('upsertRoles rolls back applied changes when a later write fails', async () => {
  const removed = []
  const updates = []
  const created = []
  const store = {
    get: (id) => (id === 'existing' || id === 'second'
      ? { id, name: 'Before' }
      : undefined),
    create: async (role) => { created.push(role.id) },
    update: async (id, patch) => {
      if (id === 'second') throw new Error('backend exploded')
      updates.push([id, patch])
    },
    remove: async (id) => { removed.push(id) },
  }
  await assert.rejects(
    () => upsertRoles(store, [
      { id: 'existing', name: 'After' },
      { id: 'fresh', name: 'Created' },
      { id: 'second', name: 'Never' },
    ]),
    /backend exploded.*rolled back/,
  )
  // Rollback removes the created role and restores the updated ones.
  assert.deepEqual(removed, ['fresh'])
  assert.deepEqual(updates.at(-1), ['existing', { id: 'existing', name: 'Before' }])
  assert.equal(created.length, 1)
})
