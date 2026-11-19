/**
 * Durable member snapshots and the learned-rule store.
 *
 * Member snapshots are plugin-owned JSON: the official Team roster persists the
 * member name and description, but not the role configuration a member was
 * created with. A snapshot is written before the official spawn call so a
 * cold-resumed member can be re-scoped from the same frozen definition.
 *
 * Learned rules are stored in the plugin's volatile Config, which the Settings
 * page and the Host tools both edit through the live config editor. Session
 * rules stay in memory and never persist.
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { normalizeRules, applyRule, applySessionRule, retireRule, rulesForRole, renderRules } from './rules.js'
import {
  findRole,
  mergeRoles,
  normalizeRole,
  validateRole,
} from './config.js'

const STORE_VERSION = 1

/** Resolve the plugin's private state directory. */
export function stateDir() {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'agent-team-roles')
}

/** Read one raw Config value from an editor callback's config object. */
function rawField(config, key) {
  const value = config?.[key]
  return value !== null && typeof value === 'object' && typeof value.get === 'function'
    ? value.get()
    : value
}

/** Write JSON atomically through a sibling temporary file. */
async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.rename(temporary, file)
}

/** One member's frozen creation snapshot. */
export class MemberSnapshots {
  constructor() {
    this.file = path.join(stateDir(), 'members.json')
    this.records = new Map()
    this.loaded = false
    this.writeQueue = Promise.resolve()
    this.ready = this.open()
  }

  /** Load the store, tolerating a missing file and refusing malformed records. */
  async open() {
    try {
      const text = await fs.readFile(this.file, 'utf8')
      const parsed = JSON.parse(text)
      const members = parsed?.members
      if (Array.isArray(members)) {
        for (const record of members) {
          if (
            record !== null &&
            typeof record === 'object' &&
            typeof record.rootSessionId === 'string' &&
            typeof record.name === 'string' &&
            typeof record.roleId === 'string' &&
            record.frozen !== null &&
            typeof record.frozen === 'object'
          ) {
            this.records.set(`${record.rootSessionId}\u0000${record.name}`, record)
          }
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn(`[agent-team-roles] cannot read member snapshots: ${error.message}`)
      }
    }
    this.loaded = true
  }

  /** Read one member snapshot after the store has loaded. */
  get(rootSessionId, name) {
    return this.records.get(`${rootSessionId}\u0000${name}`)
  }

  /** Record one member's frozen configuration before creation. */
  async record({ rootSessionId, name, roleId, frozen, executor = 'native', codex }) {
    const now = Date.now()
    const record = {
      version: STORE_VERSION,
      rootSessionId,
      name,
      roleId,
      executor: executor === 'codex' ? 'codex' : 'native',
      ...(executor === 'codex' && codex !== undefined ? { codex } : {}),
      frozen,
      createdAt: now,
      updatedAt: now,
    }
    this.records.set(`${rootSessionId}\u0000${name}`, record)
    await this.flush()
    return record
  }

  /** Remove one snapshot after a failed creation. */
  async remove(rootSessionId, name) {
    this.records.delete(`${rootSessionId}\u0000${name}`)
    await this.flush()
  }

  /** Persist the current snapshot map. */
  flush() {
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      if (!this.loaded) await this.ready
      await writeJsonAtomic(this.file, {
        version: STORE_VERSION,
        members: [...this.records.values()],
      })
    })
    return this.writeQueue
  }
}

/** The learned-rule store shared by Host tools and runtime prompt sections. */
export class RuleStore {
  /**
   * @param options - volatile Config reader, config editor, loader entry, and a
   *   session-scoped in-memory rule map.
   */
  constructor({ readRules, editor, entry }) {
    this.readRules = readRules
    this.editor = editor
    this.entry = entry
    this.sessionRules = new Map()
    this.fallbackRules = []
    this.writeQueue = Promise.resolve()
  }

  /** Whether persistent rules can be written. */
  get persistent() {
    return this.editor !== undefined && this.entry !== undefined
  }

  /** All persistent rules, normalized. */
  persistentRules() {
    return normalizeRules([...(this.readRules() ?? []), ...this.fallbackRules])
  }

  /** List persistent rules for one role. */
  list(roleId) {
    return rulesForRole(this.persistentRules(), roleId)
  }

  /** Add one rule. Session rules stay in memory; persistent rules edit Config. */
  async add(input) {
    const now = Date.now()
    if (input.scope === 'session') {
      const key = input.rootSessionId ?? 'unknown'
      const current = this.sessionRules.get(key) ?? []
      const result = applySessionRule(current, { ...input, id: `session-${randomUUID()}` }, now)
      if (result.refusal !== undefined) throw new Error(result.refusal)
      this.sessionRules.set(key, result.rules)
      return { rule: result.rule, scope: 'session' }
    }

    const apply = (base) => {
      const result = applyRule(base, { ...input, id: `rule-${randomUUID()}` }, now)
      if (result.refusal !== undefined) throw new Error(result.refusal)
      return result
    }

    if (!this.persistent) {
      const result = apply(normalizeRules(this.fallbackRules))
      this.fallbackRules = result.rules
      return { rule: result.rule, scope: input.scope, promoted: result.promoted }
    }

    let applied
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await this.editor.edit(this.entry, (current) => {
        const base = normalizeRules(rawField(current, 'rules'))
        applied = apply(base)
        return { ...current, rules: applied.rules }
      })
    })
    await this.writeQueue
    return { rule: applied?.rule, scope: input.scope, promoted: applied?.promoted }
  }

  /** Retire one persistent rule and keep it visible in role history. */
  async forget(id) {
    if (!this.persistent) {
      const result = retireRule(normalizeRules(this.fallbackRules), id)
      this.fallbackRules = result.rules
      return result.retired
    }
    let retired = false
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await this.editor.edit(this.entry, (current) => {
        const base = normalizeRules(rawField(current, 'rules'))
        const result = retireRule(base, id)
        retired = result.retired
        return { ...current, rules: result.rules }
      })
    })
    await this.writeQueue
    return retired
  }

  /** Session rules visible to one root Session. */
  sessionFor(rootSessionId) {
    return this.sessionRules.get(rootSessionId) ?? []
  }

  /** Render the active rules for one role in one Session. */
  render(roleId, rootSessionId) {
    return renderRules(this.persistentRules(), roleId, this.sessionFor(rootSessionId))
  }

  /** Drop one Session's in-memory rules. */
  releaseSession(rootSessionId) {
    this.sessionRules.delete(rootSessionId)
  }
}

/** Read and write the role catalog through the live config editor. */
export class RoleStore {
  /**
   * @param options - volatile Config reader, config editor, and loader entry.
   */
  constructor({ readRoles, editor, entry }) {
    this.readRoles = readRoles
    this.editor = editor
    this.entry = entry
    this.fallbackRoles = []
    this.writeQueue = Promise.resolve()
  }

  /** Whether writes reach the profile Config. */
  get persistent() {
    return this.editor !== undefined && this.entry !== undefined
  }

  /** The current catalog, including the built-in fallback. */
  list() {
    return mergeRoles(this.persistent ? this.readRoles() : this.fallbackRoles)
  }

  /** Resolve one role by identity. */
  get(id) {
    return findRole(this.list(), id)
  }

  /** Create one role and return the stored definition. */
  async create(input) {
    const role = normalizeRole(input)
    const invalid = validateRole(role)
    if (invalid !== undefined) throw new Error(invalid)
    if (findRole(this.list(), role.id) !== undefined) {
      throw new Error(`role "${role.id}" already exists`)
    }
    await this.write((roles) => [...roles, role])
    return role
  }

  /** Update one role; the identity itself is immutable. */
  async update(id, patch) {
    const current = this.get(id)
    if (current === undefined) throw new Error(`unknown role "${id}"`)
    if (patch?.id !== undefined && patch.id !== id) {
      throw new Error('role id cannot be changed; create a new role instead')
    }
    const merged = normalizeRole({ ...current, ...patch, id })
    const invalid = validateRole(merged)
    if (invalid !== undefined) throw new Error(invalid)
    await this.write((roles) => roles.map((role) => (role.id === id ? merged : role)))
    return merged
  }

  /** Delete one role. The built-in `general` fallback is protected. */
  async remove(id) {
    if (id === 'general') throw new Error('the built-in general role cannot be deleted')
    if (this.get(id) === undefined) throw new Error(`unknown role "${id}"`)
    await this.write((roles) => roles.filter((role) => role.id !== id))
  }

  /** Apply one mutation, serialized with every other role write. */
  async write(mutator) {
    if (!this.persistent) {
      this.fallbackRoles = mutator(mergeRoles(this.fallbackRoles))
      return
    }
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await this.editor.edit(this.entry, (current) => {
        const base = mergeRoles(rawField(current, 'roles'))
        return { ...current, roles: mutator(base) }
      })
    })
    await this.writeQueue
  }
}
