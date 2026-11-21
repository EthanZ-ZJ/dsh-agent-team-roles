/**
 * Contract tests for the "唯一权威 + 检查兜底" template change.
 *
 * These lock the shipped `templates/software-dev/template.json` to the agreed
 * contract: one authoritative definition per shared list, generated regions
 * that may not be hand-edited, a drift test, raw check output on delivery, and
 * a `checks-green-before-push` gate that blocks DEV shell pushes until TSE has
 * run the contract check successfully.
 *
 * The negative case mutates a copy in memory and writes it to a temp dir; the
 * shipped template file is never edited by this suite.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTemplate } from '../src/templates.js'

const templateUrl = new URL('../templates/software-dev/template.json', import.meta.url)
const templateDir = path.dirname(fileURLToPath(templateUrl))

/** Keywords the leadPlaybook must carry (the original flow section stays too). */
const PLAYBOOK_KEYWORDS = ['唯一权威定义', 'BEGIN GENERATED', '检查命令', '漂移测试', '原始输出']

/** Per-role persona keywords from the agreed contract. */
const PERSONA_KEYWORDS = {
  se: ['权威文件', '禁止', '各抄一份'],
  dev: ['生成区', '禁止手改'],
  tse: ['漂移测试', '负向验证'],
  cr: ['第二份手抄清单'],
}

/** Read and parse the shipped template straight from disk. */
function shippedTemplate() {
  return JSON.parse(fs.readFileSync(templateUrl, 'utf8'))
}

function roleById(template, id) {
  const role = template.roles.find((candidate) => candidate.id === id)
  assert.ok(role, `template must define role "${id}"`)
  return role
}

function gateById(template, id) {
  const gate = (template.gates ?? []).find((candidate) => candidate.id === id)
  assert.ok(gate, `template must define gate "${id}"`)
  return gate
}

test('the shipped software-dev template is valid JSON with the expected roles', () => {
  const template = shippedTemplate()
  assert.equal(template.id, 'software-dev')
  assert.ok(Array.isArray(template.roles) && template.roles.length > 0)
  assert.deepEqual(
    template.roles.map((role) => role.id).sort(),
    ['cicd', 'cr', 'dev', 'general', 'pm', 'se', 'tse'],
  )
})

test('readTemplate accepts the shipped template and parses its gates', async () => {
  const { template, error } = await readTemplate(templateDir)
  assert.equal(error, undefined, `shipped template must validate, got: ${error}`)
  assert.equal(template.id, 'software-dev')
  assert.ok(Array.isArray(template.gates) && template.gates.length > 0)
})

test('leadPlaybook keeps 分工与流程 and adds every authority/check keyword', () => {
  const template = shippedTemplate()
  const playbook = template.leadPlaybook
  assert.equal(typeof playbook, 'string')
  assert.match(playbook, /分工与流程/, 'the original 分工与流程 section must remain')
  for (const keyword of PLAYBOOK_KEYWORDS) {
    assert.ok(
      playbook.includes(keyword),
      `leadPlaybook must mention "${keyword}"`,
    )
  }
  assert.match(playbook, /END GENERATED/, 'generated markers must be paired')
})

test('the four owner-role personas each carry their authority clause', () => {
  const template = shippedTemplate()
  for (const [id, keywords] of Object.entries(PERSONA_KEYWORDS)) {
    const persona = roleById(template, id).persona
    assert.equal(typeof persona, 'string', `role "${id}" must have a persona`)
    for (const keyword of keywords) {
      assert.ok(
        persona.includes(keyword),
        `role "${id}" persona must mention "${keyword}"`,
      )
    }
  }
})

test('pm persona does not get an authority clause (regression)', () => {
  const pm = roleById(shippedTemplate(), 'pm')
  for (const keyword of ['唯一权威', 'BEGIN GENERATED', '各抄一份', '生成区', '禁止手改', '漂移测试', '负向验证', '第二份手抄']) {
    assert.ok(
      !pm.persona.includes(keyword),
      `pm persona must not mention "${keyword}"`,
    )
  }
})

test('checks-green-before-push is accepted by readTemplate with the agreed deny shape', async () => {
  const { template, error } = await readTemplate(templateDir)
  assert.equal(error, undefined, `readTemplate rejected the template: ${error}`)
  const gate = gateById(template, 'checks-green-before-push')
  assert.equal(gate.id, 'checks-green-before-push')
  assert.equal(gate.deny.role, 'dev')
  assert.deepEqual([...gate.deny.tool].sort(), ['bash', 'pwsh'])
})

test('checks-green-before-push commandPattern blocks git push only', async () => {
  const { template, error } = await readTemplate(templateDir)
  assert.equal(error, undefined)
  const gate = gateById(template, 'checks-green-before-push')
  assert.equal(typeof gate.deny.commandPattern, 'string', 'deny.commandPattern is required')
  // new RegExp throws on an uncompilable source, failing the test with the source named.
  const pattern = new RegExp(gate.deny.commandPattern)
  assert.ok(
    pattern.test('git push origin main'),
    `commandPattern ${JSON.stringify(gate.deny.commandPattern)} must match "git push origin main"`,
  )
  assert.ok(
    !pattern.test('git status'),
    `commandPattern ${JSON.stringify(gate.deny.commandPattern)} must not match "git status"`,
  )
})

test('checks-green-before-push requires only a fresh successful TSE contract check', async () => {
  const { template, error } = await readTemplate(templateDir)
  assert.equal(error, undefined)
  const gate = gateById(template, 'checks-green-before-push')
  assert.equal(gate.require.event, undefined, 'require must not demand an event')

  const command = gate.require.commandSuccess
  assert.ok(command, 'require.commandSuccess is required')
  assert.equal(command.role, 'tse')
  assert.ok(command.tool.includes('pwsh'), 'commandSuccess.tool must include pwsh')

  const pattern = new RegExp(command.pattern)
  assert.ok(
    pattern.test('pnpm run check:contract'),
    `commandSuccess.pattern ${JSON.stringify(command.pattern)} must match "pnpm run check:contract"`,
  )
  assert.ok(
    !pattern.test('pnpm run build'),
    `commandSuccess.pattern ${JSON.stringify(command.pattern)} must not match "pnpm run build"`,
  )

  assert.equal(gate.require.freshFor, 14400)
  const invalidateOn = gate.require.invalidateOn
  assert.equal(invalidateOn.role, 'dev')
  assert.deepEqual(invalidateOn.tool, ['write', 'edit'])
  // Path scoping: only code-file edits void the key; docs stay harmless.
  assert.ok(invalidateOn.pathPattern, 'invalidateOn.pathPattern is required for the shipped gate')
  const pathPattern = new RegExp(invalidateOn.pathPattern)
  assert.ok(pathPattern.test('src/main.ts'), 'code edits must invalidate')
  assert.ok(!pathPattern.test('docs/notes.md'), 'doc edits must not invalidate')
})

test('readTemplate rejects an in-memory broken commandPattern without touching the real file', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-template-authority-'))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))

  const corrupted = shippedTemplate()
  const gate = gateById(corrupted, 'checks-green-before-push')
  gate.deny.commandPattern = '('

  const dir = path.join(root, 'software-dev')
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(path.join(dir, 'template.json'), JSON.stringify(corrupted))

  const { template, error } = await readTemplate(dir)
  assert.equal(template, undefined, 'a broken commandPattern must not yield a template')
  assert.match(error, /gate invalid/)
  assert.match(error, /commandPattern/)
})

test('existing gates still exist and gate ids stay unique (regression)', async () => {
  const { template, error } = await readTemplate(templateDir)
  assert.equal(error, undefined)
  const ids = template.gates.map((gate) => gate.id)
  for (const id of ['review-before-commit', 'tests-green-before-commit', 'checks-green-before-push']) {
    assert.ok(ids.includes(id), `gate id "${id}" must remain in the template`)
  }
  assert.equal(new Set(ids).size, ids.length, 'gate ids must be unique')
})
