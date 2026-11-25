import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { skillRevealRoute, skillRoute } from '../src/skill-routes.js'

const base = 'http://localhost/agent-team-roles/role-skills'
const bundleContent = '---\nname: check-code\ndescription: Verify code.\n---\n# Bundled skill'
const flatContent = '---\nname: quick-check\ndescription: Verify code quickly.\n---\n# Flat skill'

test('skill detail supplies a verified file to reveal for both installed layouts', async (t) => {
  const originalHome = process.env.DSH_HOME
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-role-skills-'))
  process.env.DSH_HOME = home
  t.after(async () => {
    if (originalHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = originalHome
    await fs.rm(home, { recursive: true, force: true })
  })
  const roleDir = path.join(home, 'agent-team-roles', 'skills', 'dev')
  const bundle = path.join(roleDir, 'check-code')
  const bundleFile = path.join(bundle, 'SKILL.md')
  const flatFile = path.join(roleDir, 'quick-check.md')
  await fs.mkdir(bundle, { recursive: true })
  await fs.writeFile(bundleFile, bundleContent)
  await fs.writeFile(flatFile, flatContent)

  const route = skillRoute()
  const get = (suffix, options) => route.resource(new Request(base + suffix, options))
  assert.deepEqual(await (await get('/dev')).json(), {
    skills: ['check-code', 'clean-code-guard', 'frontend-design', 'quick-check', 'web-interface-guidelines'],
  })
  const packaged = await (await get('/pm/design-taste-frontend')).json()
  assert.equal(packaged.name, 'design-taste-frontend')
  assert.match(packaged.content, /^description: >-\r?$/m)
  assert.equal((await get('/dev/design-taste-frontend')).status, 404)
  for (const [name, file, content] of [
    ['check-code', bundleFile, bundleContent], ['quick-check', flatFile, flatContent],
  ]) {
    assert.deepEqual(await (await get(`/dev/${name}`)).json(), { name, content, filePath: await fs.realpath(file) })
  }
  const outside = path.join(home, 'outside')
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'SKILL.md'), '# Not a role skill')
  await fs.symlink(outside, path.join(roleDir, 'outside'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal((await get('/dev/outside')).status, 404)
  assert.equal((await get('/dev/missing')).status, 404)
  assert.equal((await get('/dev/check-code', { method: 'POST' })).status, 405)
})

test('skill reveal resolves the installed path and refuses anything else', async (t) => {
  const originalHome = process.env.DSH_HOME
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-role-reveal-'))
  process.env.DSH_HOME = home
  t.after(async () => {
    if (originalHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = originalHome
    await fs.rm(home, { recursive: true, force: true })
  })
  const roleDir = path.join(home, 'agent-team-roles', 'skills', 'dev')
  await fs.mkdir(path.join(roleDir, 'check-code'), { recursive: true })
  const file = path.join(roleDir, 'check-code', 'SKILL.md')
  await fs.writeFile(file, bundleContent)

  const calls = []
  const controller = {
    canOpenWorkspacePath: () => true,
    openWorkspacePath: async (request) => { calls.push(request); return { opened: true } },
  }
  const route = skillRevealRoute(() => controller)
  const call = async (body, method = 'POST') => {
    const request = new Request('http://localhost/agent-team-roles/skill-reveal', {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    })
    const response = { statusCode: 0, headers: {}, setHeader(name, value) { this.headers[name] = value }, end(payload) { this.body = JSON.parse(payload) } }
    await route.handler(request, response)
    return response
  }
  assert.equal((await call({ role: 'dev', skill: 'check-code' })).statusCode, 200)
  assert.deepEqual(calls, [{ path: await fs.realpath(file), action: 'reveal' }])
  assert.equal((await call({ role: 'dev', skill: 'check-code' }, 'GET')).statusCode, 405)
  assert.equal((await call({ role: '../dev', skill: 'check-code' })).statusCode, 400)
  assert.equal((await call({ role: 'dev', skill: 'missing' })).statusCode, 404)
  const unavailable = skillRevealRoute(() => undefined)
  const refused = { statusCode: 0, setHeader() {}, end(payload) { this.body = JSON.parse(payload) } }
  await unavailable.handler(new Request('http://localhost/agent-team-roles/skill-reveal', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'dev', skill: 'check-code' }),
  }), refused)
  assert.equal(refused.statusCode, 501)
})
