import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const patch = fs.readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const preset = patch.slice(patch.indexOf('preset-team-lead'))

test('the bundle ships a Team Lead agent preset', () => {
  assert.match(preset, /name: '@deepseek-ai\/dsh-agent-preset'/)
  assert.match(preset, /id: team-lead/)
  assert.match(preset, /name: Team Lead/)
  assert.match(preset, /dsh-persona/)
  assert.match(preset, /dsh-tool-ask-user/)
  assert.match(preset, /dsh-compaction/)
  assert.match(preset, /wait_agent/)
  assert.match(preset, /并发派发/)
})

test('the Team Lead preset exposes no shell, filesystem, web, or subagent tools', () => {
  assert.doesNotMatch(preset, /dsh-tool-(bash|pwsh|fs|fs-search|web|subagent|workflow)/)
  assert.doesNotMatch(preset, /dsh-skill-filesystem/)
})
