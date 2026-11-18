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
  return {
    template: {
      id,
      name: parsed.name.trim(),
      description: typeof parsed.description === 'string' ? parsed.description : '',
      leadPlaybook: typeof parsed.leadPlaybook === 'string' ? parsed.leadPlaybook : '',
      roles,
      dir,
    },
  }
}

/** Scan a templates root; invalid entries are skipped, never thrown. */
export async function discoverTemplates(root) {
  let entries
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
 * Copies `skills/<roleId>/` subtrees into `skillsRoot/<roleId>/`; existing
 * files are overwritten, unrelated files are never deleted.
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
    await fs.mkdir(path.join(skillsRoot, entry.name), { recursive: true })
    await fs.cp(path.join(source, entry.name), path.join(skillsRoot, entry.name), { recursive: true })
    copied.push(entry.name)
  }
  return { copied }
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
        await store.update(role.id, role)
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
