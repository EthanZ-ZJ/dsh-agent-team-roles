import test from 'node:test'
import assert from 'node:assert/strict'
import { activeMembers, leadCatalog, leadMemoryGuide, leadRoutingGuide, leadWorkflowGuide, memberPersona } from '../src/prompts.js'

test('the Lead workflow guide states the dispatch-first protocol with live limits', () => {
  const text = leadWorkflowGuide({ selfBudget: 2, preDispatchBudget: 0 })
  assert.match(text, /dispatch first, then verify/)
  assert.match(text, /team_task_create/)
  assert.match(text, /at most 0 time\(s\) before a dispatch/)
  assert.match(text, /at most 2 time\(s\) per turn/)
  assert.match(text, /dispatch report/)
  assert.match(text, /stop and dispatch/)
})

test('the Lead routing guide forbids implementation and names the delegation path', () => {
  const text = leadRoutingGuide()
  assert.match(text, /Do not implement/)
  assert.match(text, /spawn_team_member/)
  assert.match(text, /send_message/)
  assert.match(text, /test role/)
  assert.match(text, /run_code/)
  assert.match(text, /subagent/)
  assert.match(text, /stop and delegate/)
})

test('the Lead memory guide routes rules to the profile and facts to project memory', () => {
  const text = leadMemoryGuide()
  assert.match(text, /record_role_feedback/)
  assert.match(text, /role: "lead"/)
  assert.match(text, /memory_capture/)
  assert.match(text, /\.plugins\/memory/)
  assert.match(text, /every project/)
  assert.match(text, /from now on/)
  assert.match(text, /list_role_rules/)
  assert.match(text, /forget_role_rule/)
  assert.match(text, /作为 Lead 通用规则/)
})

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
  assert.match(text, /Dispatch every independent task first/)
  assert.match(text, /wait_agent/)
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

test('leadCatalog omits the playbook section when empty', () => {
  const text = leadCatalog([{ id: 'reviewer', name: 'Reviewer', description: 'Reviews' }])
  assert.doesNotMatch(text, /Orchestration playbook/)
})

test('leadCatalog renders a non-empty playbook after the catalog', () => {
  const text = leadCatalog([{ id: 'reviewer', name: 'Reviewer', description: 'Reviews' }], '  Route diffs to reviewers.  ')
  assert.match(text, /## Orchestration playbook/)
  assert.match(text, /Route diffs to reviewers\./)
  assert.ok(text.indexOf('Configured roles:') < text.indexOf('## Orchestration playbook'))
})
