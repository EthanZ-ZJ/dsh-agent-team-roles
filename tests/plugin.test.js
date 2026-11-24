import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, Config, isHandshakeOnly, isHandshakeSettlement, isTeamLeadPreset, nativeMemberAllowList, roleForMember } from '../src/plugin.js'

test('legacy TSE allow-lists gain browser acceptance tools without granting them to other roles', () => {
  const configured = ['read', 'pwsh']
  const tse = nativeMemberAllowList('tse', configured)
  for (const name of ['skills_get', 'list_windows', 'launch', 'snapshot', 'find', 'click', 'type', 'screenshot', 'wait']) {
    const tool = `mcp__agent-desktop__desktop_${name}`
    assert.ok(tse.has(tool), tool)
    assert.ok(!nativeMemberAllowList('cr', configured).has(tool), tool)
  }
  assert.ok(tse.has('pwsh'))
  assert.ok(tse.has('web_fetch'))
  assert.ok(!tse.has('mcp__agent-desktop__desktop_batch'))
  assert.ok(!tse.has('mcp__agent-desktop__desktop_clipboard_get'))
  assert.deepEqual(configured, ['read', 'pwsh'])
})

test('role config schema preserves fallback effort and defaults it independently', () => {
  const { roles } = Config({ roles: [
    { id: 'dev', reasoningEffort: 'high', fallbackReasoningEffort: 'low' },
    { id: 'legacy', reasoningEffort: 'high' },
  ] })
  assert.deepEqual(roles.get().map((role) => [role.reasoningEffort, role.fallbackReasoningEffort]), [
    ['high', 'low'], ['high', ''],
  ])
})

test('automatic fallback retries with its own effort and omits it for legacy roles', async () => {
  const home = process.env.DSH_HOME
  process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'team-roles-auto-fallback-'))
  let requestError
  let member = 'dev'
  try {
    apply({
      get: () => undefined,
      fiber: {},
      agents: { list: () => [] },
      agentTeams: {
        tryMembership: () => ({
          role: 'teammate',
          root: { id: 'root', session: { header: { agentPreset: 'team-lead' } } },
          name: member,
        }),
      },
      on(event, listener) { if (event === 'agent/request-error') requestError = listener },
      effect(register, name) { if (name === 'agent-team-roles:auto-fallback') register() },
      provide() {},
      inject() {},
    }, { roles: [
      { id: 'dev', reasoningEffort: 'high', fallbackProvider: 'p', fallbackModel: 'm', fallbackReasoningEffort: 'low' },
      { id: 'legacy', reasoningEffort: 'high', fallbackProvider: 'p', fallbackModel: 'm' },
    ] })
  } finally {
    if (home === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = home
  }
  const selected = []
  const payload = { agent: { model: { select: (value) => selected.push(value) } }, turn: 1, failure: { status: 402, message: 'quota exhausted' } }
  const next = () => assert.fail('expected an automatic retry')
  assert.deepEqual(await requestError(payload, next), { kind: 'retry' })
  member = 'legacy'
  assert.deepEqual(await requestError(payload, next), { kind: 'retry' })
  assert.deepEqual(selected, [
    { provider: 'p', model: 'm', reasoningEffort: 'low' },
    { provider: 'p', model: 'm' },
  ])
})

function notice(closing = 'READY') {
  return {
    source: {
      kind: 'subagent-settled',
      senderSessionId: 'child-1',
      summary: 'Background subagent child-1 finished',
    },
    content: [
      { type: 'text', text: 'Background subagent child-1 finished and will do no further work.' },
      { type: 'text', text: 'Its closing message:' },
      { type: 'text', text: closing },
    ],
  }
}

test('a member with a snapshot keeps its frozen role, not the general fallback', () => {
  const frozen = { id: 'se', name: 'SE', description: 'Analysis', persona: 'Read only.' }
  const snapshot = { roleId: 'se', frozen }
  const catalog = [
    { id: 'general', name: 'General', description: 'Fallback' },
    frozen,
  ]
  assert.equal(roleForMember(snapshot, catalog, 'se').id, 'se')
  assert.equal(roleForMember(undefined, catalog, 'se').id, 'se')
})

test('only the team-lead preset counts as a Team Lead session', () => {
  const agent = (preset) => ({ session: { header: { agentPreset: preset } } })
  assert.equal(isTeamLeadPreset(agent('team-lead')), true)
  assert.equal(isTeamLeadPreset(agent('standard')), false)
  assert.equal(isTeamLeadPreset(agent(undefined)), false)
  assert.equal(isTeamLeadPreset(undefined), false)
})

test('a background subagent READY settlement is recognized', () => {
  assert.equal(isHandshakeSettlement(notice()), true)
  assert.equal(isHandshakeOnly([notice()]), true)
})

test('a non-READY settlement is not a handshake', () => {
  assert.equal(isHandshakeSettlement(notice('Task complete')), false)
})

test('an ordinary user message is not a handshake', () => {
  assert.equal(isHandshakeSettlement({ source: { kind: 'user' }, content: [{ type: 'text', text: 'READY' }] }), false)
})

test('mixed claimed messages are never collapsed', () => {
  assert.equal(isHandshakeOnly([notice(), { source: { kind: 'user' }, content: [] }]), false)
  assert.equal(isHandshakeOnly([]), false)
})
