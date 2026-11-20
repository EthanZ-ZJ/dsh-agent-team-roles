import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { skillRoute } from '../src/skill-routes.js'

const base = 'http://localhost/agent-team-roles/role-skills'

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
  await fs.writeFile(bundleFile, '# Bundled skill')
  await fs.writeFile(flatFile, '# Flat skill')

  const route = skillRoute()
  const get = (suffix, options) => route.resource(new Request(base + suffix, options))
  assert.deepEqual(await (await get('/dev')).json(), { skills: ['check-code', 'quick-check'] })
  for (const [name, file, content] of [
    ['check-code', bundleFile, '# Bundled skill'], ['quick-check', flatFile, '# Flat skill'],
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
