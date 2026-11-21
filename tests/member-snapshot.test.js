import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { MemberSnapshots } from '../src/store.js'
import { effectiveMemberRoute } from '../src/plugin.js'

const role = {
  id: 'dev',
  name: 'DEV',
  provider: 'zai',
  model: 'glm-5.3-flash',
  reasoningEffort: 'high',
}

test('rebasing an idle snapshot replaces the frozen role and persists it', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-snapshot-rebase-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(async () => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await fs.rm(home, { recursive: true, force: true })
  })
  const store = new MemberSnapshots()
  await store.ready
  await store.record({ rootSessionId: 'root', name: 'dev', roleId: 'dev', frozen: { ...role, model: 'old-model' } })
  const updated = await store.rebase('root', 'dev', role)
  assert.equal(updated.frozen.model, 'glm-5.3-flash')
  await store.flush()
  const reopened = new MemberSnapshots()
  await reopened.ready
  assert.equal(reopened.get('root', 'dev').frozen.model, 'glm-5.3-flash')
  assert.equal(await store.rebase('root', 'ghost', role), undefined, 'an unknown member is not created')
})

test('a member route prefers a switch override, then the live role, then the snapshot', () => {
  const frozen = { ...role, model: 'frozen-model' }
  const live = { ...role, model: 'live-model' }
  const override = { provider: 'p2', model: 'm2', reasoningEffort: '' }
  assert.equal(effectiveMemberRoute({ override, liveRole: live, frozen }).model, 'm2')
  assert.equal(effectiveMemberRoute({ override: undefined, liveRole: live, frozen }).model, 'live-model')
  assert.equal(effectiveMemberRoute({ override: undefined, liveRole: undefined, frozen }).model, 'frozen-model')
})
