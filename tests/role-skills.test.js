/**
 * Contract tests for role-private skills (`src/skills.js`).
 *
 * `installRoleSkills` merges packaged and local skills for one role and
 * registers the allowed definitions in that member's Agent scope.
 * These tests use a temporary DSH_HOME and a fake Agent so the real scanner is
 * exercised without touching the installed state directory.
 *
 * They also lock the merged SE architect skill: the shipped role folder must
 * hold exactly one skill whose frontmatter name and description match the
 * merged handbook, so the two-skill layout cannot come back unnoticed.
 */

import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { installRoleSkills } from '../src/skills.js'

const shippedSeDir = fileURLToPath(new URL('../templates/software-dev/skills/se', import.meta.url))

/** Build a fake Agent whose skill service records every registration. */
function fakeAgent() {
  const registered = []
  const agent = {
    ctx: {
      inject(_deps, callback) {
        let disposed = false
        queueMicrotask(() => {
          if (disposed) return
          callback({
            skills: {
              register(definition) {
                registered.push(definition)
                return () => {
                  const index = registered.indexOf(definition)
                  if (index >= 0) registered.splice(index, 1)
                }
              },
            },
          })
        })
        return { dispose: async () => { disposed = true } }
      },
    },
  }
  return { agent, registered }
}

/** Point DSH_HOME at a fresh temp directory for one test. */
async function makeHome(t, roleId = 'se') {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-role-skills-'))
  const originalHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(async () => {
    if (originalHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = originalHome
    await fsp.rm(home, { recursive: true, force: true })
  })
  return {
    home,
    roleDir: path.join(home, 'agent-team-roles', 'skills', roleId),
  }
}

/** Write one bundled skill under the role folder. */
async function writeBundle(roleDir, dirName, { name = dirName, description = 'A role skill.' } = {}) {
  const dir = path.join(roleDir, dirName)
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nBody.\n`)
  return dir
}

/** Install for the SE role and return the registered definitions. */
async function installFor(skills) {
  const { agent, registered } = fakeAgent()
  installRoleSkills(agent, { id: 'se', skills })
  await Promise.resolve()
  return registered
}

test('installRoleSkills exposes every skill in the role folder when role.skills is empty', async (t) => {
  const { roleDir } = await makeHome(t)
  await writeBundle(roleDir, 'alpha')
  await writeBundle(roleDir, 'gamma')
  const flatFile = path.join(roleDir, 'beta.md')
  await fsp.writeFile(flatFile, '---\nname: beta\ndescription: A flat role skill.\n---\n\n# beta\n\nBody.\n')
  // Entries the scanner must ignore: no SKILL.md, and a non-markdown file.
  await fsp.mkdir(path.join(roleDir, 'not-a-bundle'), { recursive: true })
  await fsp.writeFile(path.join(roleDir, 'notes.txt'), 'ignored')

  const registered = await installFor([])

  assert.deepEqual(registered.map((definition) => definition.name).sort(), ['alpha', 'beta', 'gamma', 'software-architect'])
  for (const definition of registered) {
    assert.equal(definition.source, 'runtime')
    assert.equal(definition.provider, 'agent-team-roles')
  }
})

test('installRoleSkills registers only the whitelisted skill names', async (t) => {
  const { roleDir } = await makeHome(t)
  await writeBundle(roleDir, 'alpha')
  await writeBundle(roleDir, 'beta')
  await writeBundle(roleDir, 'gamma')

  const registered = await installFor(['beta'])

  assert.deepEqual(registered.map((definition) => definition.name), ['beta'])
})

test('a malformed role skill is skipped without dropping the others', async (t) => {
  const { roleDir } = await makeHome(t)
  await writeBundle(roleDir, 'good')
  const brokenDir = path.join(roleDir, 'broken')
  await fsp.mkdir(brokenDir, { recursive: true })
  // No description: the parser must reject this skill silently.
  await fsp.writeFile(path.join(brokenDir, 'SKILL.md'), '---\nname: broken\n---\n\n# broken\n\nBody.\n')
  const badNameDir = path.join(roleDir, 'bad-name')
  await fsp.mkdir(badNameDir, { recursive: true })
  await fsp.writeFile(path.join(badNameDir, 'SKILL.md'), '---\nname: Bad Name\ndescription: Invalid characters.\n---\n\n# bad\n\nBody.\n')

  const registered = await installFor([])

  assert.deepEqual(registered.map((definition) => definition.name).sort(), ['good', 'software-architect'])
})

test('a fresh state discovers the packaged SE handbook and keeps its references', async (t) => {
  const { home } = await makeHome(t)
  const bundle = await fsp.realpath(path.join(shippedSeDir, 'software-architect'))
  assert.deepEqual(await fsp.readdir(home), [])

  const registered = await installFor([])

  assert.equal(registered.length, 1)
  const [definition] = registered
  assert.equal(definition.name, 'software-architect')
  assert.ok(definition.description.includes('接口契约'), 'description must cover the API-contract duty')
  assert.ok(definition.description.includes('兼容性'), 'description must cover compatibility/versioning')
  assert.ok(definition.content.includes('## 5. 接口契约'), 'content must keep the contract section')
  assert.ok(definition.content.includes('## 1. 角色契约与 L0–L3 分级'), 'content must keep the leveling section')
  assert.equal(definition.source, 'runtime')
  assert.equal(definition.provider, 'agent-team-roles')
  assert.equal(definition.resourceBase.kind, 'directory')
  assert.equal(path.resolve(definition.resourceBase.path), path.resolve(bundle))
  assert.equal(definition.invocation.modelInvocable, true)
  assert.equal(definition.invocation.userInvocable, true)

  const references = (await fsp.readdir(path.join(bundle, 'references'))).sort()
  assert.deepEqual(references, [
    'adr-template.md',
    'anti-patterns.md',
    'contract-checklist.md',
    'design-doc.md',
    'quality-scenarios.md',
    'review-checklist.md',
    'tradeoff-matrix.md',
  ])

  // The parser takes the name from frontmatter, so the raw header must agree
  // with the directory or the settings chip and whitelist would disagree.
  const raw = await fsp.readFile(path.join(bundle, 'SKILL.md'), 'utf8')
  assert.match(raw, /^---\r?\n/)
  assert.match(raw, /^name: software-architect$/m)
  assert.match(raw, /^description: .+/m)
})

test('bundled defaults are scoped per role and do not register outside the Team Lead preset', async (t) => {
  await makeHome(t)
  const cases = {
    pm: ['design-taste', 'design-taste-frontend', 'product-sense'],
    se: ['software-architect'],
    dev: ['clean-code-guard', 'frontend-design', 'web-interface-guidelines'],
    cr: ['clean-code-guard', 'frontend-design', 'web-interface-guidelines'],
    general: [],
    tse: [],
    cicd: [],
    lead: [],
  }
  for (const [id, names] of Object.entries(cases)) {
    const { agent, registered } = fakeAgent()
    const dispose = installRoleSkills(agent, { id, skills: [] })
    await Promise.resolve()
    assert.deepEqual(registered.map((skill) => skill.name).sort(), names, id)
    for (const skill of registered) {
      assert.equal(path.basename(path.dirname(skill.resourceBase.path)), id)
    }
    dispose?.()
    assert.deepEqual(registered, [], `removed ${id} registrations on disposal`)
  }
  const { agent, registered } = fakeAgent()
  assert.equal(installRoleSkills(agent, { id: 'pm', skills: [] }, () => false), undefined)
  let admitted = true
  const dispose = installRoleSkills(agent, { id: 'pm', skills: [] }, () => admitted)
  admitted = false
  await Promise.resolve()
  assert.deepEqual(registered, [])
  dispose()
})

test('a same-role local definition overrides the packaged name without widening selections', async (t) => {
  const { roleDir } = await makeHome(t, 'dev')
  const bundle = await writeBundle(roleDir, 'local-guide', { name: 'frontend-design', description: 'Local override.' })
  await writeBundle(roleDir, 'other')
  const skills = ['frontend-design']
  const dev = fakeAgent()
  const cr = fakeAgent()
  installRoleSkills(dev.agent, { id: 'dev', skills })
  installRoleSkills(cr.agent, { id: 'cr', skills })
  await Promise.resolve()
  assert.deepEqual(dev.registered.map((skill) => skill.name), skills)
  assert.deepEqual(cr.registered.map((skill) => skill.name), skills)
  assert.equal(dev.registered[0].description, 'Local override.')
  assert.equal(dev.registered[0].resourceBase.path, await fsp.realpath(bundle))
  assert.notEqual(cr.registered[0].description, 'Local override.')
})

test('folded description keeps the body and does not consume invocation metadata', async (t) => {
  const { roleDir } = await makeHome(t, 'general')
  await fsp.mkdir(roleDir, { recursive: true })
  await fsp.writeFile(path.join(roleDir, 'sample.md'), '\uFEFF---\r\ndescription: >-\r\n  First line.\r\n  A second line: yes.\r\ndisable-model-invocation: true\r\nuser-invocable: false\r\nhooks:\r\n  Stop: ignored\r\n---\r\n# Body\r\n')
  const { agent, registered } = fakeAgent()
  installRoleSkills(agent, { id: 'general', skills: [] })
  await Promise.resolve()
  assert.equal(registered.length, 1)
  assert.equal(registered[0].description, 'First line. A second line: yes.')
  assert.equal(registered[0].content, '# Body\r\n')
  assert.deepEqual(registered[0].invocation, { modelInvocable: false, userInvocable: false })
  assert.equal(registered[0].hooks, undefined)
})

test('the shipped SE role folder holds exactly one merged architect skill', async () => {
  const entries = await fsp.readdir(shippedSeDir, { withFileTypes: true })

  assert.deepEqual(entries.map((entry) => entry.name), ['software-architect'])
  assert.ok(entries[0].isDirectory())

  const bundle = path.join(shippedSeDir, 'software-architect')
  const skillFile = path.join(bundle, 'SKILL.md')
  assert.ok(fs.existsSync(skillFile), 'the merged skill keeps its SKILL.md')
  const raw = fs.readFileSync(skillFile, 'utf8')
  assert.match(raw, /^---\r?\n/)
  assert.match(raw, /^name: software-architect$/m)
  assert.match(raw, /^description: .+/m)

  const references = fs.readdirSync(path.join(bundle, 'references'))
  assert.equal(references.length, 7, 'all seven references ship with the merged skill')
})
