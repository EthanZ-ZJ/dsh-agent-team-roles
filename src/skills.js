/**
 * Role-private skills.
 *
 * Each role may own a folder at `$DSH_HOME/agent-team-roles/skills/<roleId>/`.
 * Every direct child bundle (`<name>/SKILL.md`) or flat file (`<name>.md`) is
 * registered as a runtime skill in that member's Agent scope, so the skill is
 * not visible to the Lead or to any other role. An empty role `skills` list
 * exposes every skill in the folder; otherwise only the listed names are
 * registered. Global skills remain visible through the deployment's own skill
 * provider.
 */

import fs from 'node:fs'
import path from 'node:path'
import { stateDir } from './store.js'

const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Parse the small frontmatter subset role-private skills use. */
function parseSkill(input) {
  const text = input.replace(/^\uFEFF/, '')
  if (!text.startsWith('---')) return { meta: {}, body: text }
  const end = text.indexOf('\n---', 3)
  if (end < 0) return { meta: {}, body: text }
  const head = text.slice(3, end)
  const body = text.slice(end + 4).replace(/^\r?\n/, '')
  const meta = {}
  for (const line of head.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (match === null) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    meta[match[1]] = value
  }
  return { meta, body }
}

/** Read one skill bundle or flat file. */
function readSkill(entryPath, fallbackName) {  let file = entryPath
  let name = fallbackName
  const stat = fs.statSync(entryPath)
  if (stat.isDirectory()) {
    file = path.join(entryPath, 'SKILL.md')
    if (!fs.existsSync(file)) return undefined
  }
  const { meta, body } = parseSkill(fs.readFileSync(file, 'utf8'))
  const skillName = (meta.name ?? name).trim()
  const description = (meta.description ?? '').trim()
  if (!SKILL_NAME.test(skillName) || description === '' || body.trim() === '') return undefined
  return {
    name: skillName,
    description,
    ...(meta.whenToUse === undefined || meta.whenToUse === ''
      ? {}
      : { whenToUse: meta.whenToUse }),
    content: body,
    invocation: {
      modelInvocable: !/^(true|yes|on|1)$/i.test(meta['disable-model-invocation'] ?? ''),
      userInvocable: !/^(false|no|off|0)$/i.test(meta['user-invocable'] ?? 'true'),
    },
    source: 'runtime',
    provider: 'agent-team-roles',
    resourceBase: {
      kind: 'directory',
      path: stat.isDirectory() ? entryPath : path.dirname(entryPath),
    },
  }
}

/**
 * Register one role's private skills in its member Agent scope.
 *
 * @param agent - the created member Agent.
 * @param role - the frozen role snapshot.
 * @param when - whether the current composition still admits the role skills.
 * @returns a disposer for the injection and every registered skill, or
 *   undefined when the role's skill folder is absent.
 */
export function installRoleSkills(agent, role, when = () => true) {
  const root = path.join(stateDir(), 'skills', role.id)
  if (!fs.existsSync(root)) return undefined

  const selected = new Set(role.skills ?? [])
  const definitions = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const name = entry.name.replace(/\.md$/i, '')
    const entryPath = path.join(root, entry.name)
    const isFlat = entry.isFile() && entry.name.toLowerCase().endsWith('.md')
    const isBundle = entry.isDirectory() && fs.existsSync(path.join(entryPath, 'SKILL.md'))
    if (!isFlat && !isBundle) continue
    const definition = readSkill(entryPath, name)
    if (definition === undefined) continue
    if (selected.size > 0 && !selected.has(definition.name)) continue
    definitions.push(definition)
  }

  const disposers = []
  let active = true
  const fiber = agent.ctx.inject(['skills'], (injected) => {
    for (const definition of definitions) {
      if (!active || !when()) return
      try {
        const dispose = injected.skills.register(definition)
        if (active) disposers.push(dispose)
        else dispose()
      } catch {
        // A malformed role skill is skipped; other role skills stay available.
      }
    }
  })
  return () => {
    if (!active) return
    active = false
    // Remove discovery immediately, then cancel/tear down the child fiber.
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose()
      } catch {
        // The Agent scope is being torn down; individual cleanup is best-effort.
      }
    }
    void Promise.resolve(fiber.dispose()).catch(() => {})
  }
}
