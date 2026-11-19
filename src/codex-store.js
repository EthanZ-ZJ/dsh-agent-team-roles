/**
 * Durable Codex thread records (`stateDir()/codex-threads.json`).
 *
 * One record per Team member: the Codex thread id, its cwd/sandbox/transport,
 * turn count, and the last answers used for rotation summaries. Records are
 * kept across member removal so a cold-resumed member can continue; pruning is
 * deliberately out of scope.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { stateDir } from './store.js'
import { CODEX_LAST_ANSWERS_LIMIT, CODEX_LAST_ANSWER_CHARS } from './codex-cli.js'

const STORE_VERSION = 1

/** Write JSON atomically through a sibling temporary file. */
async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.rename(temporary, file)
}

/** Normalize one stored thread record; returns undefined for malformed rows. */
function normalizeRecord(record) {
  if (record === null || typeof record !== 'object') return undefined
  if (typeof record.rootSessionId !== 'string' || typeof record.name !== 'string') return undefined
  return {
    rootSessionId: record.rootSessionId,
    name: record.name,
    roleId: typeof record.roleId === 'string' ? record.roleId : '',
    threadId: typeof record.threadId === 'string' ? record.threadId : '',
    cwd: typeof record.cwd === 'string' ? record.cwd : '',
    sandbox: typeof record.sandbox === 'string' ? record.sandbox : 'danger-full-access',
    transport: typeof record.transport === 'string' ? record.transport : 'auto',
    turns: Number.isSafeInteger(record.turns) ? record.turns : 0,
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : 0,
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : 0,
    lastAnswers: Array.isArray(record.lastAnswers)
      ? record.lastAnswers
          .map((entry) => String(entry ?? ''))
          .filter((entry) => entry !== '')
          .slice(-CODEX_LAST_ANSWERS_LIMIT)
          .map((entry) => entry.slice(0, CODEX_LAST_ANSWER_CHARS))
      : [],
    rotatedFrom: typeof record.rotatedFrom === 'string' ? record.rotatedFrom : '',
  }
}

/** Per-member Codex thread store. */
export class CodexThreadStore {
  constructor({ file } = {}) {
    this.file = file ?? path.join(stateDir(), 'codex-threads.json')
    this.records = new Map()
    this.writeQueue = Promise.resolve()
    this.ready = this.open()
  }

  /** Load the store, ignoring a missing file and malformed rows. */
  async open() {
    try {
      const text = await fs.readFile(this.file, 'utf8')
      const parsed = JSON.parse(text)
      const threads = Array.isArray(parsed?.threads) ? parsed.threads : []
      for (const raw of threads) {
        const record = normalizeRecord(raw)
        if (record !== undefined) this.records.set(`${record.rootSessionId}\u0000${record.name}`, record)
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn(`[agent-team-roles] cannot read Codex threads: ${error.message}`)
      }
    }
  }

  /** Read one member's record after load. */
  get(rootSessionId, name) {
    return this.records.get(`${rootSessionId}\u0000${name}`)
  }

  /** Record one member's thread state. */
  async record(input) {
    await this.ready
    const now = Date.now()
    const key = `${input.rootSessionId}\u0000${input.name}`
    const previous = this.records.get(key)
    const record = {
      ...(previous ?? {}),
      rootSessionId: input.rootSessionId,
      name: input.name,
      roleId: input.roleId ?? previous?.roleId ?? '',
      threadId: input.threadId ?? previous?.threadId ?? '',
      cwd: input.cwd ?? previous?.cwd ?? '',
      sandbox: input.sandbox ?? previous?.sandbox ?? 'danger-full-access',
      transport: input.transport ?? previous?.transport ?? 'auto',
      turns: input.turns ?? previous?.turns ?? 0,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      lastAnswers: input.lastAnswers ?? previous?.lastAnswers ?? [],
      rotatedFrom: input.rotatedFrom ?? previous?.rotatedFrom ?? '',
    }
    this.records.set(key, record)
    await this.flush()
    return record
  }

  /** Clear one member's active thread id (keep the record for history). */
  async clearThread(rootSessionId, name, { rotatedFrom = '' } = {}) {
    const previous = this.get(rootSessionId, name)
    if (previous === undefined) return undefined
    return this.record({
      ...previous,
      threadId: '',
      turns: 0,
      lastAnswers: [],
      rotatedFrom: rotatedFrom === '' ? previous.threadId : rotatedFrom,
    })
  }

  /** Persist the current record map. */
  flush() {
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await this.ready
      await writeJsonAtomic(this.file, {
        version: STORE_VERSION,
        threads: [...this.records.values()],
      })
    })
    return this.writeQueue
  }
}
