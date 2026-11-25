/**
 * Team template packs: domain-specific role catalogs + Lead playbooks as data.
 *
 * A template lives in `<stateDir>/templates/<id>/template.json` and may ship
 * private skills in `<stateDir>/templates/<id>/skills/<roleId>/`. The plugin
 * seeds built-in templates into the state dir on activation (missing dirs only,
 * never overwriting user edits) and applies a template by upserting its roles
 * into the live catalog, setting activeTemplate, and merging its skills.
 *
 * This module is pure logic plus explicit fs: every function takes its roots,
 * so tests can point them at temporary directories.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { normalizeRole, validateRole } from './config.js'
import { MAX_GATES, normalizeGate, validateGate } from './gates.js'
import { scanRoleSkills } from './skills.js'

/** Filename of the template descriptor inside a template directory. */
export const TEMPLATE_FILE = 'template.json'

/** Resolve the state-dir templates root. */
export function templatesRoot(stateDir) {
  return path.join(stateDir, 'templates')
}

/** Read and validate one template directory. Returns {template} or {error}. */
export async function readTemplate(dir) {
  let raw
  try {
    raw = await fs.readFile(path.join(dir, TEMPLATE_FILE), 'utf8')
  } catch (error) {
    return { error: `cannot read ${TEMPLATE_FILE}: ${error.message}` }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { error: `invalid JSON: ${error.message}` }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'template must be a JSON object' }
  }
  const id = typeof parsed.id === 'string' ? parsed.id.trim() : ''
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) return { error: `invalid template id "${id}"` }
  if (typeof parsed.name !== 'string' || parsed.name.trim() === '') return { error: 'name is required' }
  if (parsed.leadPlaybook !== undefined && typeof parsed.leadPlaybook !== 'string') {
    return { error: 'leadPlaybook must be a string' }
  }
  if (!Array.isArray(parsed.roles) || parsed.roles.length === 0) {
    return { error: 'roles must be a non-empty array' }
  }
  const roles = []
  const seen = new Set()
  for (const candidate of parsed.roles) {
    const role = normalizeRole(candidate)
    const invalid = validateRole(role)
    if (invalid !== undefined) return { error: `role invalid: ${invalid}` }
    if (seen.has(role.id)) return { error: `duplicate role id "${role.id}"` }
    seen.add(role.id)
    roles.push(role)
  }
  const gates = []
  if (parsed.gates !== undefined) {
    if (!Array.isArray(parsed.gates)) return { error: 'gates must be an array' }
    if (parsed.gates.length > MAX_GATES) return { error: `gates exceeds ${MAX_GATES} entries` }
    const seenGates = new Set()
    for (const candidate of parsed.gates) {
      const gate = normalizeGate(candidate)
      const invalid = validateGate(gate)
      if (invalid !== undefined) return { error: `gate invalid: ${invalid}` }
      if (seenGates.has(gate.id)) return { error: `duplicate gate id "${gate.id}"` }
      seenGates.add(gate.id)
      gates.push(gate)
    }
  }
  return {
    template: {
      id,
      name: parsed.name.trim(),
      description: typeof parsed.description === 'string' ? parsed.description : '',
      leadPlaybook: typeof parsed.leadPlaybook === 'string' ? parsed.leadPlaybook : '',
      roles,
      gates,
      dir,
    },
  }
}

/**
 * Merge one template's gates into the live list.
 *
 * Only the incoming gates are validated: a template must not be able to write a
 * broken entry. Pre-existing entries are preserved as-is (so a legacy defect
 * never blocks an otherwise valid apply), but they still count toward the cap
 * and are reported in `warnings`.
 *
 * @param existing - current configured gates.
 * @param incoming - gates from the template.
 * @param options - optional `max` override for the team-wide cap.
 * @returns `{gates, replaced, warnings, error}`; a rejected merge writes nothing.
 */
export function mergeTemplateGates(existing, incoming, options = {}) {
  const max = Number.isFinite(options.max) ? options.max : MAX_GATES
  const current = Array.isArray(existing) ? [...existing] : []
  const added = Array.isArray(incoming) ? incoming.map((gate) => normalizeGate(gate)) : []
  const addedIds = new Set()
  for (const gate of added) {
    const invalid = validateGate(gate)
    if (invalid !== undefined) return { gates: [], replaced: [], warnings: [], error: `gate invalid: ${invalid}` }
    if (addedIds.has(gate.id)) {
      return { gates: [], replaced: [], warnings: [], error: `duplicate gate id "${gate.id}" in this template` }
    }
    addedIds.add(gate.id)
  }
  const warnings = []
  for (const [index, raw] of current.entries()) {
    const gate = normalizeGate(raw)
    const problem = validateGate(gate)
    if (problem !== undefined) {
      warnings.push(`existing ${gate.id === '' ? `gate #${index}` : `gate "${gate.id}"`}: ${problem}`)
    }
  }
  const currentIds = new Set(current.map((gate) => normalizeGate(gate).id))
  const replaced = added.filter((gate) => currentIds.has(gate.id)).map((gate) => gate.id)
  const merged = [...current.filter((gate) => !addedIds.has(normalizeGate(gate).id)), ...added]
  if (merged.length > max) {
    return {
      gates: [],
      replaced: [],
      warnings,
      error: `applying this template would leave ${merged.length} gates; the limit is ${max}`,
    }
  }
  return { gates: merged, replaced, warnings, error: undefined }
}

/** Scan a templates root; invalid entries are skipped, never thrown. */
export async function discoverTemplates(root) {  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const templates = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    const result = await readTemplate(dir)
    if (result.template !== undefined) templates.push(result.template)
  }
  return templates.sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * Copy built-in template directories into the state dir. Missing directories
 * are seeded whole; existing ones are left untouched so user edits survive.
 */
export async function seedTemplates(root, builtinRoot) {
  let entries
  try {
    entries = await fs.readdir(builtinRoot, { withFileTypes: true })
  } catch {
    return { seeded: [] }
  }
  const seeded = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const hasDescriptor = await fs
      .access(path.join(builtinRoot, entry.name, TEMPLATE_FILE))
      .then(() => true)
      .catch(() => false)
    if (!hasDescriptor) continue
    const target = path.join(root, entry.name)
    const exists = await fs
      .access(target)
      .then(() => true)
      .catch(() => false)
    if (exists) continue
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.cp(path.join(builtinRoot, entry.name), target, { recursive: true })
    seeded.push(entry.name)
  }
  return { seeded }
}

/**
 * Merge a template's private skills into the live skills root.
 *
 * Copies new entries into `skillsRoot/<roleId>/`. An existing bundle or flat
 * skill with the same entry name is left intact, including its resources.
 */
export async function copyTemplateSkills(templateDir, skillsRoot) {
  const source = path.join(templateDir, 'skills')
  let entries
  try {
    entries = await fs.readdir(source, { withFileTypes: true })
  } catch {
    return { copied: [] }
  }
  const copied = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const roleSource = path.join(source, entry.name)
    const roleTarget = path.join(skillsRoot, entry.name)
    await fs.mkdir(roleTarget, { recursive: true })
    if (!(await fs.lstat(roleTarget)).isDirectory()) continue
    const stem = (name) => name.replace(/\.md$/i, '').toLowerCase()
    const existing = new Set((await fs.readdir(roleTarget)).map(stem))
    const existingNames = scanRoleSkills(skillsRoot, entry.name)
    const shadowedEntries = new Set([...scanRoleSkills(source, entry.name)]
      .filter(([name]) => existingNames.has(name))
      .map(([, { entryName }]) => entryName))
    let wrote = false
    for (const skill of await fs.readdir(roleSource, { withFileTypes: true })) {
      if (!skill.isDirectory() && !skill.isFile()) continue
      if (existing.has(stem(skill.name)) || shadowedEntries.has(skill.name)) continue
      await fs.cp(path.join(roleSource, skill.name), path.join(roleTarget, skill.name), { recursive: true, force: false })
      existing.add(stem(skill.name))
      wrote = true
    }
    if (wrote) copied.push(entry.name)
  }
  return { copied }
}

/**
 * Fields a template cannot clear by leaving them out.
 *
 * A parsed template role is normalized, so an unspecified model route arrives
 * as `provider: ''`. Writing that through would erase a route the user
 * configured in Settings — the exact regression this guard prevents. The same
 * applies to a role's private skills and command policy: an empty template list
 * means "not specified", not "clear it".
 */
const PRESERVE_WHEN_EMPTY = [
  'name',
  'description',
  'persona',
  'provider',
  'model',
  'reasoningEffort',
  'fallbackProvider',
  'fallbackModel',
  'fallbackReasoningEffort',
  'color',
]

const PRESERVE_WHEN_EMPTY_LIST = ['fallbacks', 'skills', 'denyCommands']

/**
 * Merge one template role over an existing one without erasing live settings.
 *
 * @param existing - the role currently in the catalog.
 * @param incoming - the normalized role parsed from the template.
 * @returns the patch to write, or the incoming role when it is new.
 */
export function mergeTemplateRole(existing, incoming) {
  if (existing === undefined) return incoming
  const patch = { ...incoming }
  for (const field of PRESERVE_WHEN_EMPTY) {
    const value = incoming[field]
    if (value === undefined || value === null || value === '') {
      // Keep the patch minimal: a field the live role does not carry either is
      // simply left out instead of written back as undefined.
      if (existing[field] === undefined) delete patch[field]
      else patch[field] = existing[field]
    }
  }
  for (const field of PRESERVE_WHEN_EMPTY_LIST) {
    const value = incoming[field]
    if (!Array.isArray(value) || value.length === 0) {
      if (existing[field] === undefined) delete patch[field]
      else patch[field] = existing[field]
    }
  }
  // Applying a template is not an instruction to replace an explicit role
  // skill allow-list, even if this version of the template has new defaults.
  if (Array.isArray(existing.skills) && existing.skills.length > 0) patch.skills = existing.skills
  return patch
}

/**
 * Upsert template roles into a live role store (get/create/update interface).
 *
 * Best-effort transactional: any failure rolls back the already-applied changes
 * in reverse order (created roles are removed, updated roles are restored to
 * their previous value). A rollback itself can fail — the original error is
 * rethrown either way, with the rollback state noted for the caller to report.
 */
export async function upsertRoles(store, roles) {
  const applied = []
  const undo = []
  try {
    for (const role of roles) {
      const existing = store.get(role.id)
      if (existing === undefined) {
        await store.create(role)
      } else {
        await store.update(role.id, mergeTemplateRole(existing, role))
      }
      undo.push({ id: role.id, existing })
      applied.push({ id: role.id, action: existing === undefined ? 'created' : 'updated' })
    }
    return applied
  } catch (error) {
    let rollbackFailures = 0
    for (const entry of undo.reverse()) {
      try {
        if (entry.existing === undefined) {
          if (typeof store.remove === 'function') await store.remove(entry.id)
        } else {
          await store.update(entry.id, entry.existing)
        }
      } catch {
        rollbackFailures += 1
      }
    }
    const note = rollbackFailures === 0
      ? 'applied changes were rolled back'
      : `applied changes were rolled back with ${rollbackFailures} rollback failure(s); check the catalog`
    throw new Error(`${error.message} (${note})`)
  }
}
