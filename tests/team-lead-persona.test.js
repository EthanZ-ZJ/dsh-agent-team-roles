import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')

// Keep this check independent of the Harness installation and its YAML loader.
// The shipped persona's complete mode replaces the whole assembled prompt,
// including the plugin's Lead memory and saved-rule sections.
test('the Team Lead persona is scoped to its preset and allows other prompt sections', () => {
  const personaRows = [...patch.matchAll(
    /^( +)- id: persona\r?\n\1  name: '@deepseek-ai\/dsh-persona'\r?\n\1  config:\r?\n((?:\1 {4}[^\r\n]*\r?\n|\r?\n)+)/gm,
  )]
  assert.equal(personaRows.length, 1, 'the patch should declare only one persona row')
  const [row, indent, config] = personaRows[0]
  const preset = patch.match(/^    - id: preset-team-lead\r?\n(?:\r?\n| {6}[^\r\n]*\r?\n)+/m)?.[0]
  assert.ok(preset?.includes(row), 'the persona belongs inside the Team Lead preset')
  assert.equal(indent.length, 10, 'the persona must be a preset plugin, not a host row')
  assert.match(config, /^ {14}complete: false\r?$/m)
  assert.match(config, /^ {16}你是这个团队的 Team Lead \/ 调度者。/m)
})
