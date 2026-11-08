import test from 'node:test'
import assert from 'node:assert/strict'
import { RoleStore } from '../src/store.js'
import { GENERAL_ROLE } from '../src/config.js'

function build() {
  let config = { roles: [GENERAL_ROLE], rules: [] }
  const store = new RoleStore({
    readRoles: () => config.roles,
    editor: {
      async edit(_entry, change) {
        config = change(structuredClone(config))
      },
    },
    entry: {},
  })
  return { store, config: () => config }
}

test('a role created through the store is persisted and listed', async () => {
  const { store, config } = build()
  await store.create({
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews changes',
    persona: 'Be strict.',
    toolMode: 'custom',
    tools: ['read', 'write'],
  })
  assert.equal(config().roles.length, 2)
  const role = store.get('reviewer')
  assert.equal(role.name, 'Reviewer')
  assert.equal(role.toolMode, 'custom')
  assert.deepEqual(role.tools, ['read', 'write'])
})

test('creating a duplicate id is refused', async () => {
  const { store } = build()
  await store.create({ id: 'reviewer' })
  await assert.rejects(() => store.create({ id: 'reviewer' }), /already exists/)
})

test('the role id is immutable on update', async () => {
  const { store } = build()
  await store.create({ id: 'reviewer' })
  await assert.rejects(() => store.update('reviewer', { id: 'other' }), /cannot be changed/)
  const updated = await store.update('reviewer', { persona: 'Updated.' })
  assert.equal(updated.persona, 'Updated.')
})

test('the built-in general role cannot be deleted', async () => {
  const { store } = build()
  await assert.rejects(() => store.remove('general'), /cannot be deleted/)
})

test('an unknown role update is refused', async () => {
  const { store } = build()
  await assert.rejects(() => store.update('missing', { name: 'x' }), /unknown role/)
})
