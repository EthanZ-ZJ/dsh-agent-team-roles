import test from 'node:test'
import assert from 'node:assert/strict'
import { activeMembers, leadCatalog, memberPersona } from '../src/prompts.js'

test('lead catalog lists every role and disables the ad-hoc tool', () => {
  const text = leadCatalog([
    { id: 'general', name: 'General', description: 'General work' },
    { id: 'reviewer', name: 'Reviewer', description: 'Reviews changes' },
  ])
  assert.match(text, /spawn_team_member/)
  assert.match(text, /spawn_teammate/)
  assert.match(text, /general/)
  assert.match(text, /reviewer/)
  assert.match(text, /Reviews changes/)
  assert.match(text, /project-specific facts/)
  assert.match(text, /memory_capture/)
})

test('member persona includes the role card and learned rules', () => {  const text = memberPersona({
    target: 'reviewer-2',
    frozen: {
      id: 'reviewer',
      name: 'Reviewer',
      description: 'Reviews changes',
      persona: 'Be strict about tests.',
      provider: '',
      model: '',
    },
    rulesText: 'Standing instructions learned from user feedback:\n- Do not modify tests',
  })
  assert.match(text, /reviewer-2/)
  assert.match(text, /Reviewer/)
  assert.match(text, /Be strict about tests/)
  assert.match(text, /Do not modify tests/)
  assert.match(text, /TEAM_HANDSHAKE/)
  assert.match(text, /reply with exactly READY/)
})

test('active members section names each live teammate and its role', () => {
  const text = activeMembers([
    {
      name: 'se',
      status: 'inactive',
      description: 'Solution engineer',
      role: { id: 'se', name: 'SE', description: 'Analyze only; do not edit code.' },
    },
  ])
  assert.match(text, /Active team members/)
  assert.match(text, /se: SE \(se\)/)
  assert.match(text, /Analyze only; do not edit code\./)
  assert.match(text, /inactive/)
  assert.match(text, /do not spawn a duplicate/i)
})

test('active members section handles an empty roster', () => {
  const text = activeMembers([])
  assert.match(text, /No teammates are active yet/)
  assert.match(text, /spawn_team_member/)
})
