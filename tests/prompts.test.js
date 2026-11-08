import test from 'node:test'
import assert from 'node:assert/strict'
import { leadCatalog, memberPersona } from '../src/prompts.js'

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
})

test('member persona includes the role card and learned rules', () => {
  const text = memberPersona({
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
})
