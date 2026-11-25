import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROLE_ID } from './config.js'
import { stateDir } from './store.js'

export const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
const bundledSkillsRoot = fileURLToPath(new URL('../templates/software-dev/skills/', import.meta.url))

/** Parse the skill metadata subset, including folded (`>-`) descriptions. */
function parseSkill(input) {
  const text = input.replace(/^\uFEFF/, '')
  const frontmatter = /^---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m.exec(text)
  if (frontmatter?.index !== 0) return { meta: {}, body: text }
  const body = text.slice(frontmatter[0].length)
  const meta = Object.create(null)
  const lines = frontmatter[1].split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(lines[index])
    if (match === null) continue
    let value = match[2].trim()
    if (/^>[-+]?(?:[ \t]+#.*)?$/.test(value)) {
      // Only consume indented content. Stop at the next top-level key so an
      // upstream description cannot swallow invocation metadata or the body.
      const words = []
      while (index + 1 < lines.length && /^(?: +|[ \t]*$)/.test(lines[index + 1])) {
        const line = lines[++index].trim()
        if (line !== '') words.push(line)
      }
      value = words.join(' ')
    } else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    meta[match[1]] = value
  }
  return { meta, body }
}

/** Scan real files within one role only; an unreadable or malformed entry is skipped. */
export function scanRoleSkills(root, roleId) {
  const records = new Map()
  if (typeof roleId !== 'string' || !ROLE_ID.test(roleId)) return records
  let dir
  let entries
  try {
    const resolvedRoot = fs.realpathSync(root)
    dir = fs.realpathSync(path.join(resolvedRoot, roleId))
    if (path.relative(resolvedRoot, dir) !== roleId) return records
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return records
  }
  // Prefer a bundle over a flat file with the same name in one source.
  entries.sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))
  for (const entry of entries) {
    const bundle = entry.isDirectory()
    if (!bundle && (!entry.isFile() || !/\.md$/i.test(entry.name))) continue
    const relative = bundle ? path.join(entry.name, 'SKILL.md') : entry.name
    try {
      const filePath = fs.realpathSync(path.join(dir, relative))
      if (path.relative(dir, filePath) !== relative || !fs.lstatSync(filePath).isFile()) continue
      const raw = fs.readFileSync(filePath, 'utf8')
      const { meta, body } = parseSkill(raw)
      const name = (meta.name ?? (bundle ? entry.name : entry.name.slice(0, -3))).trim()
      const description = (meta.description ?? '').trim()
      if (!SKILL_NAME.test(name) || description === '' || body.trim() === '' || records.has(name)) continue
      records.set(name, {
        entryName: entry.name,
        filePath,
        raw,
        definition: {
          name,
          description,
          ...(meta.whenToUse ? { whenToUse: meta.whenToUse } : {}),
          content: body,
          invocation: {
            modelInvocable: !/^(true|yes|on|1)$/i.test(meta['disable-model-invocation'] ?? ''),
            userInvocable: !/^(false|no|off|0)$/i.test(meta['user-invocable'] ?? 'true'),
          },
          source: 'runtime',
          provider: 'agent-team-roles',
          resourceBase: { kind: 'directory', path: path.dirname(filePath) },
        },
      })
    } catch {
      // The rest of the role catalog remains available.
    }
  }
  return records
}

/** Package defaults plus valid same-role overrides, keyed by canonical skill name. */
export function resolveRoleSkills(roleId) {
  return new Map([
    ...scanRoleSkills(bundledSkillsRoot, roleId),
    ...scanRoleSkills(path.join(stateDir(), 'skills'), roleId),
  ])
}

/** Install the role's selected private skills only in its member Agent scope. */
export function installRoleSkills(agent, role, when = () => true) {
  if (!when()) return undefined
  const selected = new Set(role.skills ?? [])
  const definitions = [...resolveRoleSkills(role.id).values()]
    .map((record) => record.definition)
    .filter((definition) => selected.size === 0 || selected.has(definition.name))
  if (definitions.length === 0) return undefined

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
