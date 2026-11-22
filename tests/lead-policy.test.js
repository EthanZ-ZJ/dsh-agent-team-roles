import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LEAD_IMPLEMENTATION_TOOLS,
  LEAD_TOOL_MODES,
  leadDelegateReason,
  leadToolPolicy,
} from '../src/lead-policy.js'

test('the default policy hides every built-in implementation tool', () => {
  const policy = leadToolPolicy()
  assert.equal(policy.mode, 'hide')
  for (const name of LEAD_IMPLEMENTATION_TOOLS) assert.ok(policy.names.has(name), `${name} is denied`)
  assert.ok(policy.names.has('run_code'), 'the PTC transport is denied for the Lead')
})

test('extra denied tools extend the built-in list and blanks are dropped', () => {
  const policy = leadToolPolicy({ mode: 'deny', deny: ['desktop_click', '  ', 42, 'desktop_type'] })
  assert.equal(policy.mode, 'deny')
  assert.deepEqual([...policy.names].filter((name) => name.startsWith('desktop')).sort(), ['desktop_click', 'desktop_type'])
  assert.ok(policy.names.has('write'), 'the built-in list still applies')
})

test('an unknown mode falls back to hiding instead of silently allowing', () => {
  assert.equal(leadToolPolicy({ mode: 'sometimes' }).mode, 'hide')
  for (const mode of LEAD_TOOL_MODES) assert.equal(leadToolPolicy({ mode }).mode, mode)
})

test('the refusal names the tool, the teammates, and the routing tools', () => {
  const reason = leadDelegateReason('write', ['dev', 'tse'])
  assert.match(reason, /"write" is reserved for teammates/)
  assert.match(reason, /does not implement/)
  assert.match(reason, /Current teammates: dev, tse/)
  assert.match(reason, /spawn_team_member/)
  assert.match(reason, /send_message/)
  assert.match(reason, /Do not look for another way/)
})

test('the refusal still instructs when the Team has no teammate yet', () => {
  const reason = leadDelegateReason('pwsh')
  assert.doesNotMatch(reason, /Current teammates/)
  assert.match(reason, /spawn_team_member/)
})
