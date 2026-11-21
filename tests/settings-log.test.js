import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { diffRoles, SettingsLog, settingsLogRoute, settingsLogNoteRoute, applySettingsRoute } from '../src/settings-log.js'
import { roleCatalogRoute } from '../src/role-routes.js'

const role = (overrides = {}) => ({ id: 'dev', name: 'DEV', provider: 'p', model: 'm', tools: ['read'], ...overrides })

test('diffRoles reports a model route change with before and after values', () => {
  const changes = diffRoles([role()], [role({ model: 'm2' })])
  assert.deepEqual(changes, [{ roleId: 'dev', fields: [{ field: 'model', from: 'm', to: 'm2' }] }])
})

test('diffRoles reports added, removed, and tool-policy changes', () => {
  const changes = diffRoles(
    [role(), role({ id: 'cr' })],
    [role({ tools: ['read', 'pwsh'], toolMode: 'custom' })],
  )
  const byId = Object.fromEntries(changes.map((change) => [change.roleId, change]))
  assert.equal(byId.cr.removed, true)
  assert.deepEqual(byId.dev.fields.map((field) => field.field).sort(), ['toolMode', 'tools'])
  const added = diffRoles([], [role({ id: 'new' })])
  assert.equal(added[0].added, true)
})

test('the log records one entry per real change and attributes a noted actor', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-settings-log-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const log = new SettingsLog({ dir })
  assert.equal(log.observe([role()]), undefined, 'the first observation is the baseline')
  log.note('lead:update_team_role')
  const entry = log.observe([role({ model: 'm2' })])
  assert.equal(entry.actor, 'lead:update_team_role')
  assert.equal(log.observe([role({ model: 'm2' })]), undefined, 'an unchanged catalog adds nothing')
  const fallback = log.observe([role({ model: 'm2', provider: 'q' })])
  assert.equal(fallback.actor, 'settings', 'an unannounced change is attributed to the Settings page')
  await log.queue
  const entries = await log.read(10)
  assert.equal(entries.length, 2)
  assert.equal(entries[0].changes[0].fields[0].field, 'provider', 'newest first')
})

test('a stale note never mislabels a later change', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-settings-log-stale-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const log = new SettingsLog({ dir })
  log.observe([role()])
  log.note('role-service:update')
  const entry = log.observe([role({ model: 'm3' })], Date.now() + 60000)
  assert.equal(entry.actor, 'settings')
  await log.queue
})

test('the log file keeps a bounded history and read caps its page', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-settings-log-cap-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const log = new SettingsLog({ dir })
  let roles = [role()]
  log.observe(roles)
  for (let index = 0; index < 5; index += 1) {
    roles = [role({ model: `m-${index}` })]
    log.observe(roles)
  }
  await log.queue
  const entries = await log.read(2)
  assert.deepEqual(entries.map((entry) => entry.changes[0].fields[0].to), ['m-4', 'm-3'])
})

test('the settings log route reads entries and the note route attributes the actor', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-settings-log-route-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const log = new SettingsLog({ dir })
  log.observe([role()])
  log.observe([role({ provider: 'q' })])
  await log.queue
  const base = 'http://localhost/agent-team-roles/settings-log'
  const route = settingsLogRoute(log)
  const listed = await route.resource(new Request(`${base}?limit=5`))
  assert.equal(listed.status, 200)
  const body = await listed.json()
  assert.equal(body.entries.length, 1)
  assert.equal(body.entries[0].changes[0].roleId, 'dev')
  assert.equal((await route.resource(new Request(base, { method: 'POST' }))).status, 405)

  const noteRoute = settingsLogNoteRoute(log)
  const responses = []
  const res = {
    statusCode: 0,
    setHeader() {},
    end(payload) { responses.push(JSON.parse(payload)) },
  }
  await noteRoute.handler(new Request('http://localhost/agent-team-roles/settings-log-note', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actor: 'settings-ui' }),
  }), res)
  assert.deepEqual(responses.at(-1), { noted: true })
  await noteRoute.handler(new Request('http://localhost/agent-team-roles/settings-log-note'), res)
  assert.equal(res.statusCode, 405)
  log.observe([role({ provider: 'q', model: 'm9' })])
  await log.queue
  assert.equal((await log.read(1))[0].actor, 'settings-ui')
})

test('the role catalog route summarizes routing and policy fields', async () => {
  const route = roleCatalogRoute(() => [{
    id: 'dev', name: 'DEV', provider: 'zai', model: 'glm-5.3-flash', reasoningEffort: 'high',
    fallbacks: [{ provider: 'p2', model: 'm2', reasoningEffort: '' }],
    toolMode: 'custom', tools: ['read', 'pwsh'], skills: ['clean-code-guard'], denyCommands: ['\\bgit\\s+push\\b'],
    fallbackProvider: '', fallbackModel: '', fallbackReasoningEffort: '',
  }])
  assert.equal(route.kind, 'prefix')
  const response = await route.resource(new Request('http://localhost/agent-team-roles/roles'))
  const body = await response.json()
  assert.deepEqual(body.roles[0], {
    id: 'dev', name: 'DEV', provider: 'zai', model: 'glm-5.3-flash', reasoningEffort: 'high',
    fallbacks: [{ provider: 'p2', model: 'm2', reasoningEffort: '' }],
    toolMode: 'custom', tools: 2, skills: ['clean-code-guard'], denyCommands: ['\\bgit\\s+push\\b'],
  })
  const wrong = await roleCatalogRoute(() => []).resource(new Request('http://localhost/agent-team-roles/roles', { method: 'POST' }))
  assert.equal(wrong.status, 405)
})

test('apply settings is POST-only and returns the applied members', async () => {
  const route = applySettingsRoute(async () => ({ members: [{ member: 'dev', role: 'dev', applied: ['model'] }], roles: 3 }))
  assert.equal(route.kind, 'exact')
  const responses = []
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    end(payload) { responses.push(JSON.parse(payload)) },
  }
  const wrong = {
    statusCode: 0,
    setHeader() {},
    end(payload) { responses.push(JSON.parse(payload)) },
  }
  await route.handler(new Request('http://localhost/agent-team-roles/apply-settings'), wrong)
  assert.equal(wrong.statusCode, 405)
  await route.handler(new Request('http://localhost/agent-team-roles/apply-settings', { method: 'POST' }), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(responses.at(-1).members[0].applied, ['model'])
})
