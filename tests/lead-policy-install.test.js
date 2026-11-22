import test from 'node:test'
import assert from 'node:assert/strict'
import { installLeadToolPolicy } from '../src/plugin.js'

/**
 * Build the minimum scoped services the installer touches.
 *
 * `restrict` mimics the real validation: names that are not mounted global
 * tools throw, which the installer must tolerate per name.
 */
function createScope({ mounted = ['write', 'edit', 'pwsh', 'read'], teammates = ['dev'] } = {}) {
  const restrictions = []
  const guards = []
  const sections = []
  const disposers = []
  const scoped = {
    tools: {
      restrict(filter) {
        for (const name of filter.deny ?? []) {
          if (!mounted.includes(name)) throw new Error(`tools.restrict() names unknown global tool "${name}"`)
        }
        restrictions.push(filter)
        return () => {}
      },
      guard(fn) {
        guards.push(fn)
        return () => {}
      },
    },
    systemPrompt: {
      getSectionOrder: () => 100,
      section(definition) {
        sections.push(definition)
        return () => {}
      },
    },
  }
  const ctx = {
    agentTeams: {
      listMembers: () => [
        { name: 'lead', role: 'lead' },
        ...teammates.map((name) => ({ name, role: 'teammate' })),
      ],
    },
  }
  const register = (disposer) => {
    if (typeof disposer === 'function') disposers.push(disposer)
  }
  return { scoped, ctx, register, restrictions, guards, sections, disposers }
}

const policyConfig = (mode, deny = []) => ({ leadToolMode: mode, leadToolDeny: deny })

test('hide removes every mounted implementation tool and leaves read tools alone', () => {
  const scope = createScope()
  installLeadToolPolicy({ ...scope, agent: { id: 'root' }, config: policyConfig('hide') })
  assert.deepEqual(scope.restrictions.map((filter) => filter.deny[0]).sort(), ['edit', 'pwsh', 'write'])
  assert.ok(scope.sections.some((section) => section.name === 'agent-team-roles:lead-routing'))
})

test('the guard refuses an implementation call with a routing reminder', () => {
  const scope = createScope()
  installLeadToolPolicy({ ...scope, agent: { id: 'root' }, config: policyConfig('deny') })
  assert.deepEqual(scope.restrictions, [], 'deny mode keeps the tools visible')
  const guard = scope.guards[0]
  const reason = guard({ name: 'write', arguments: {} })
  assert.match(reason, /"write" is reserved for teammates/)
  assert.match(reason, /Current teammates: dev/)
  assert.match(reason, /spawn_team_member/)
  assert.equal(guard({ name: 'read', arguments: {} }), undefined, 'read-only tools stay allowed')
})

test('the guard covers workaround entry points that cannot be restricted', () => {
  const scope = createScope()
  installLeadToolPolicy({ ...scope, agent: { id: 'root' }, config: policyConfig('hide') })
  const guard = scope.guards[0]
  for (const name of ['run_code', 'subagent', 'subagent_fork']) {
    assert.match(guard({ name, arguments: {} }), /does not implement/, `${name} is refused`)
  }
})

test('extra denied tools and the off switch are honoured', () => {
  const extra = createScope()
  installLeadToolPolicy({ ...extra, agent: { id: 'root' }, config: policyConfig('deny', ['desktop_click']) })
  assert.match(extra.guards[0]({ name: 'desktop_click', arguments: {} }), /reserved for teammates/)

  const off = createScope()
  installLeadToolPolicy({ ...off, agent: { id: 'root' }, config: policyConfig('off') })
  assert.deepEqual(off.restrictions, [])
  assert.deepEqual(off.guards, [])
  assert.deepEqual(off.sections, [], 'an unrestricted Lead gets no routing section')
})

test('the policy is read live, so switching it off releases the guard', () => {
  const config = { leadToolMode: 'deny', leadToolDeny: [] }
  const scope = createScope()
  installLeadToolPolicy({ ...scope, agent: { id: 'root' }, config })
  const guard = scope.guards[0]
  assert.ok(guard({ name: 'write', arguments: {} }))
  config.leadToolMode = 'off'
  assert.equal(guard({ name: 'write', arguments: {} }), undefined)
})
