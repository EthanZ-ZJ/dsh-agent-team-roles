/**
 * Static/contract checks that do not need a DOM or the live Host.
 *
 * These pin the pieces the contract calls out as "two mirrors with no shared
 * import": the client's MAX_GATES and error-code dictionaries, the Host Config
 * fields, the parser's contract constants, and the generic-src vocabulary rule.
 * Behaviour that needs the rendered Settings page is covered by the GUI script
 * in docs/e2e-gates-nl.md, not here.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  AUDIT_MAX_BYTES,
  GATE_PARSE_NS,
  GATE_PARSE_PURPOSE,
  GATE_PARSE_SYSTEM_PROMPT,
  MAX_PARSE_DETAIL,
  MAX_PARSE_GATES,
  MAX_PARSE_NOTE,
  MAX_PARSE_PROMPT_BYTES,
  MAX_PARSE_TEXT,
  MAX_PARSE_WARNING,
  MAX_PARSE_WARNINGS,
  PARSE_ERROR_CODES,
  PARSE_POLL_INTERVAL_MS,
  PARSE_REQUEST_TTL_MS,
  PARSE_RESULT_TTL_MS,
  PARSE_RETRY_DELAYS_MS,
  PARSE_TIMEOUT_MS,
} from '../src/gate-parse.js'
import { MAX_GATES, evaluateGates } from '../src/gates.js'
import { GateLedger } from '../src/ledger.js'

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8')

const clientSrc = read('../client.js')
const pluginSrc = read('../src/plugin.js')
const gatesSrc = read('../src/gates.js')
const parserSrc = read('../src/gate-parse.js')
const contractSrc = read('../docs/gates-nl-ui-contract.md')

/** Domain vocabulary that generic Host code must not embed (contract §5.4/§12.6). */
const DOMAIN_PATTERN = /\b(git|commit|review|reviewer|dev|tse|cr|pm)\b|开发|提交|评审|回归|架构|契约/

/** The 12 stable host codes from contract §5.6 (persist-failed is audit-only). */
const CONTRACT_CODES = [
  'empty-text',
  'text-too-long',
  'prompt-too-large',
  'no-route',
  'llm-unavailable',
  'llm-error',
  'timeout',
  'cancelled',
  'invalid-output',
  'stale-request',
  'persist-failed',
  'unknown',
]

/**
 * Extract the `## 10.` i18n contract section and its table rows.
 *
 * The key list is parsed from the contract, not hardcoded: §10 is the single
 * source of truth and it has churned (dotted draft -> flat camelCase). Each row
 * yields `{key, placeholders, purpose}` so the test can also prove every PM
 * semantic (the "用途/语义" column) is covered by a key.
 */
function contractI18nRows() {
  const start = contractSrc.indexOf('## 10. i18n')
  assert.ok(start >= 0, 'contract must keep a §10 i18n section')
  const end = contractSrc.indexOf('## 11.', start)
  assert.ok(end > start, 'contract §10 must end before §11')
  const section = contractSrc.slice(start, end)
  const rows = [...section.matchAll(/^\|\s*`([^`]+)`\s*\|([^|]*)\|([^|]*)\|\s*$/gm)]
    .map((match) => ({
      key: match[1].trim(),
      placeholders: match[2].trim(),
      purpose: match[3].trim(),
    }))
    .filter((row) => row.purpose !== '' && !row.purpose.startsWith('用途'))
  return { section, rows }
}

/** Read one top-level object literal from client.js and evaluate it. */
function clientObjectLiteral(marker) {
  const markerAt = clientSrc.indexOf(marker)
  assert.ok(markerAt >= 0, `client.js must contain ${marker}`)
  const braceAt = clientSrc.indexOf('{', markerAt)
  let depth = 0
  let quote = null
  for (let index = braceAt; index < clientSrc.length; index += 1) {
    const char = clientSrc[index]
    if (quote !== null) {
      if (char === '\\') {
        index += 1
        continue
      }
      if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return new Function(`return ${clientSrc.slice(braceAt, index + 1)}`)()
    }
  }
  assert.fail(`unterminated object literal after ${marker}`)
}

const zhDict = clientObjectLiteral('const zh =')
const enDict = clientObjectLiteral('const en =')

/** Parse §5.6's code -> client-key mapping table. */
function contractErrorMappings() {
  const start = contractSrc.indexOf('### 5.6')
  const end = contractSrc.indexOf('### 5.7', start)
  assert.ok(start >= 0 && end > start, 'contract must keep §5.6 and §5.7')
  const table = contractSrc.slice(start, end)
  const rows = [...table.matchAll(/^\|\s*`([^`]+)`\s*\|[^|]*\|([^|]*)\|\s*$/gm)]
  const mapping = {}
  for (const [, code, handling] of rows) {
    const key = /`((?:gateAi|gateParse)[A-Za-z0-9]*)`/.exec(handling)
    if (key !== null) mapping[code] = key[1]
  }
  return mapping
}

/** The client's code -> i18n key table. */
const clientErrorMap = clientObjectLiteral('const PARSE_ERROR_KEYS =')

// ---------------------------------------------------------------------------
// Contract constants and the closed error-code set
// ---------------------------------------------------------------------------

test('parser constants match the contract caps', () => {
  assert.equal(GATE_PARSE_NS, 'agent-team-roles')
  assert.equal(GATE_PARSE_PURPOSE, 'agent-team-roles-gate-parse')
  assert.equal(MAX_PARSE_TEXT, 4000)
  assert.equal(MAX_PARSE_GATES, 5)
  assert.equal(MAX_PARSE_NOTE, 2000)
  assert.equal(MAX_PARSE_WARNINGS, 10)
  assert.equal(MAX_PARSE_WARNING, 200)
  assert.equal(MAX_PARSE_DETAIL, 500)
  assert.equal(MAX_PARSE_PROMPT_BYTES, 24576)
  assert.equal(PARSE_REQUEST_TTL_MS, 120_000)
  assert.equal(PARSE_TIMEOUT_MS, 45_000)
  assert.equal(PARSE_RESULT_TTL_MS, 600_000)
  assert.equal(PARSE_POLL_INTERVAL_MS, 1000)
  assert.deepEqual([...PARSE_RETRY_DELAYS_MS], [30_000, 60_000, 120_000], 'D8 backoff is 30/60/120s')
  assert.equal(AUDIT_MAX_BYTES, 1024 * 1024)
})

test('the stable error-code set is exactly the 12 contract codes', () => {
  assert.deepEqual([...PARSE_ERROR_CODES].sort(), [...CONTRACT_CODES].sort())
})

test('the generic system prompt contains no domain vocabulary', () => {
  assert.equal(typeof GATE_PARSE_SYSTEM_PROMPT, 'string')
  assert.ok(GATE_PARSE_SYSTEM_PROMPT.length > 0)
  assert.doesNotMatch(GATE_PARSE_SYSTEM_PROMPT, DOMAIN_PATTERN)
  assert.match(GATE_PARSE_SYSTEM_PROMPT, /JSON/)
})

test('new generic parser source contains no domain vocabulary', () => {
  assert.doesNotMatch(parserSrc, DOMAIN_PATTERN)
})

// ---------------------------------------------------------------------------
// Host wiring: volatile Config fields and parser installation
// ---------------------------------------------------------------------------

test('Config declares both volatile gate-parse handshake fields', () => {
  const requestBlock = /gateParseRequest:\s*z\.object\(\{([\s\S]*?)\}\)[\s\S]{0,600}?volatile\(\)/.exec(pluginSrc)
  const resultBlock = /gateParseResult:\s*z\.object\(\{([\s\S]*?)\}\)[\s\S]{0,900}?volatile\(\)/.exec(pluginSrc)
  assert.ok(requestBlock, 'Config.gateParseRequest must be a volatile z.object')
  assert.ok(resultBlock, 'Config.gateParseResult must be a volatile z.object')
  for (const field of ['nonce', 'text', 'at']) {
    assert.match(requestBlock[1], new RegExp(`${field}\\s*:`), `gateParseRequest.${field}`)
  }
  for (const field of ['nonce', 'status', 'gates', 'note', 'warnings', 'code', 'detail', 'completedAt']) {
    assert.match(resultBlock[1], new RegExp(`${field}\\s*:`), `gateParseResult.${field}`)
  }
})

test('apply() installs the gate parser and disposes it through ctx.effect', () => {
  assert.match(pluginSrc, /from '\.\/gate-parse\.js'/)
  assert.match(pluginSrc, /installGateParser\s*\(\s*\{\s*ctx\s*,\s*config\s*\}/)
  assert.match(pluginSrc, /dispose/)
  assert.match(pluginSrc, /gate-parse/)
})

test('the parser exports an injectable timeout for tests', () => {
  assert.match(parserSrc, /timeoutMs/)
  assert.match(parserSrc, /PARSE_TIMEOUT_MS/)
})

// ---------------------------------------------------------------------------
// Client mirrors: MAX_GATES, i18n pairing, error-code mapping
// ---------------------------------------------------------------------------

test('client MAX_GATES mirrors src/gates.js and points at the source of truth', () => {
  const sourceMatch = /export const MAX_GATES = (\d+)/.exec(gatesSrc)
  assert.ok(sourceMatch, 'src/gates.js must export MAX_GATES')
  assert.equal(Number(sourceMatch[1]), MAX_GATES)
  assert.equal(MAX_GATES, 50)

  const clientMatch = /(?:const|let|var)\s+MAX_GATES\s*=\s*(\d+)/.exec(clientSrc)
  assert.ok(clientMatch, 'client.js must mirror MAX_GATES')
  assert.equal(Number(clientMatch[1]), MAX_GATES, 'the client mirror must equal the Host constant')

  const declarationAt = clientSrc.indexOf('MAX_GATES')
  const nearby = clientSrc.slice(Math.max(0, declarationAt - 400), declarationAt + 400)
  assert.match(nearby, /src\/gates\.js/, 'the mirror must reference src/gates.js')
})

test('the contract §10 declares 83 flat keys and client zh/en cover each one', () => {
  const { rows } = contractI18nRows()
  const keys = rows.map((row) => row.key)
  assert.equal(keys.length, 83, `contract v5 §10 must list 83 keys, found ${keys.length}`)
  assert.equal(new Set(keys).size, 83, 'contract §10 keys must be unique')
  const declared = /共 \*\*(\d+)\*\* 个 key/.exec(contractSrc)
  assert.ok(declared, 'contract §10 must declare its key count')
  assert.equal(Number(declared[1]), keys.length, 'the parsed key count must match the declared count')
  const formula = /`([\d\s+]+)=\s*(\d+)`/.exec(contractSrc)
  if (formula !== null) assert.equal(Number(formula[2]), keys.length, 'the §10.9 arithmetic must add up')
  for (const key of keys) {
    assert.doesNotMatch(key, /\./, `flat camelCase is the final namespace; got "${key}"`)
  }

  const missingZh = keys.filter((key) => !(key in zhDict))
  const missingEn = keys.filter((key) => !(key in enDict))
  assert.deepEqual(missingZh, [], `zh dictionary is missing: ${missingZh.join(', ')}`)
  assert.deepEqual(missingEn, [], `en dictionary is missing: ${missingEn.join(', ')}`)
})

test('client dictionaries contain no unregistered gateAi*/gateParse* keys (v4 reverse constraint)', () => {
  const registered = new Set(contractI18nRows().rows.map((row) => row.key))
  const gateKey = (source) => Object.keys(source).filter((key) => /^gate(?:Ai|Parse)/.test(key))
  const extraZh = gateKey(zhDict).filter((key) => !registered.has(key))
  const extraEn = gateKey(enDict).filter((key) => !registered.has(key))
  assert.deepEqual(extraZh, [], `zh has unregistered gate keys: ${extraZh.join(', ')}`)
  assert.deepEqual(extraEn, [], `en has unregistered gate keys: ${extraEn.join(', ')}`)

  // v4/v5 keys that must exist in both dictionaries.
  for (const key of [
    'gateParseToastAdopted',
    'gateParseUndo',
    'gateParseWarnAllShell',
    'gateParseWarnSelfKey',
    'gateParseWarnAck',
    'gateParseDiscardResult',
  ]) {
    assert.ok(key in zhDict, `zh must define ${key}`)
    assert.ok(key in enDict, `en must define ${key}`)
  }

  // v4 keys that were removed/renamed and must not linger.
  const dead = [
    'gateParseAdopted',
    'gateParseIgnored',
    'gateParseErrPending',
    'gateParseWarnCatchAll',
    'gateParseWarnRole',
    'gateParseToastIgnored',
  ]
  for (const key of dead) {
    assert.ok(!(key in zhDict), `zh must not define removed key ${key}`)
    assert.ok(!(key in enDict), `en must not define removed key ${key}`)
    assert.ok(!registered.has(key), `§10 must not register removed key ${key}`)
  }
})

test('zh and en dictionaries are paired key-for-key', () => {
  const zhKeys = Object.keys(zhDict).sort()
  const enKeys = Object.keys(enDict).sort()
  assert.deepEqual(zhKeys, enKeys, 'every locale key must exist in both dictionaries')
})

test('every contract §10 semantic row is covered and #15 keeps two distinct caps keys', () => {
  const { rows } = contractI18nRows()
  for (const row of rows) {
    assert.notEqual(row.purpose, '', `contract row for ${row.key} must describe its semantic`)
  }
  const keyFor = (needle) => rows.filter((row) => row.purpose.includes(needle)).map((row) => row.key)
  const tooLong = keyFor('text-too-long')
  const promptTooLarge = keyFor('prompt-too-large')
  assert.equal(tooLong.length, 1, 'one key owns text-too-long')
  assert.equal(promptTooLarge.length, 1, 'one key owns prompt-too-large')
  assert.notEqual(tooLong[0], promptTooLarge[0], '#15: promptTooLarge and textTooLong must be distinct keys')
})

test('client maps every client-visible §5.6 error code to its contract key', () => {
  const mapping = contractErrorMappings()
  const codes = Object.keys(mapping)
  assert.ok(codes.length >= 11, 'the §5.6 table must map codes to client keys')
  for (const [code, key] of Object.entries(mapping)) {
    assert.equal(clientErrorMap[code], key, `client code "${code}" must map to "${key}"`)
  }
  // D7: persist-failed is audit-only and must not be a client-visible code.
  assert.equal(clientErrorMap['persist-failed'], undefined, 'persist-failed must not be client-visible')
  assert.equal(clientErrorMap.unknown, mapping.unknown, 'unknown code falls back to its contract key')
})

test('client subscribes to the settings event and writes the request handshake fields', () => {
  assert.match(clientSrc, /settings\/document-updated/)
  assert.match(clientSrc, /\$on\s*\(/)
  assert.match(clientSrc, /gateParseRequest/)
  assert.match(clientSrc, /gateParseResult/)
  assert.match(clientSrc, /nonce/)
  assert.match(clientSrc, /completedAt/)
  assert.match(clientSrc, /refreshParseAndRevision|refreshParse/)
  assert.match(clientSrc, /90000|90_000|90\s*\*\s*1000/, 'the thinking state needs a 90s local timeout')
  assert.match(clientSrc, /crypto\.randomUUID|randomUUID/, 'the request nonce is client-minted')
})

test('client supports adopt/cancel/manual fallback and create/edit upsert semantics', () => {
  assert.match(clientSrc, /gateParseAdopt/)
  assert.match(clientSrc, /gateParseAdoptAll/)
  assert.match(clientSrc, /gateParseIgnore/)
  assert.match(clientSrc, /gateParseManual|gateAiManual/)
  assert.match(clientSrc, /gateAiCancelParse/)
  assert.match(clientSrc, /originalId/)
  assert.match(clientSrc, /mode\s*:\s*['"](?:create|edit)['"]|['"](?:create|edit)['"]/)
})

test('the client writes the gates field only from saveEngine', () => {
  const writes = [...clientSrc.matchAll(/field:\s*'gates'/g)].map((match) => match.index)
  assert.equal(writes.length, 1, 'exactly one write site for gates')
  const start = clientSrc.indexOf('const saveEngine')
  const end = start + 4200
  assert.ok(writes[0] > start && writes[0] < end, 'the only gates write lives in saveEngine')
})

test('the request write and cancel are each one atomic two-field mutate', () => {
  const startParse = /const startParse[\s\S]{0,1400}/.exec(clientSrc)
  assert.ok(startParse, 'client must keep startParse')
  assert.match(startParse[0], /gateParseRequest/)
  assert.match(startParse[0], /gateParseResult/, 'the new request clears the old result in the same mutate')

  const cancelParse = /const cancelParse[\s\S]{0,1000}/.exec(clientSrc)
  assert.ok(cancelParse, 'client must keep cancelParse')
  assert.match(cancelParse[0], /gateParseRequest/)
  assert.match(cancelParse[0], /gateParseResult/, 'cancel clears request and result atomically')
})

test('saveEngine consumes an adopted result in the same mutate', () => {
  assert.match(saveEngineRegion(), /gateParseResult/, 'an adopted result is unset by the save that consumes it')
})

test('client subscribes to settings events and refreshes parse state without overwriting dirty edits', () => {
  assert.match(clientSrc, /\$on\(\s*'settings\/document-updated'|settings\/document-updated/)
  assert.match(clientSrc, /refreshParseAndRevision/)
})

// ---------------------------------------------------------------------------
// R1 / R4 structural guards (behaviour is exercised by the GUI script)
// ---------------------------------------------------------------------------

function saveEngineRegion() {
  const start = clientSrc.indexOf('const saveEngine')
  assert.ok(start >= 0, 'client.js must keep a saveEngine function')
  const end = clientSrc.indexOf('const markDirty', start)
  return clientSrc.slice(start, end > start ? end : start + 8000)
}

test('R1: the saveEngine failure path refreshes revision/parse state instead of reloading over local edits', () => {
  const region = saveEngineRegion()
  const catchBlock = /catch\s*\([^)]*\)\s*\{([\s\S]{0,900}?)\n\s*\}\s*(?:finally|\n)/.exec(region)
  assert.ok(catchBlock, 'saveEngine must keep a try/catch/finally')
  assert.doesNotMatch(catchBlock[1], /await\s+load\s*\(/, 'R1 regression: the catch must not await load()')
  assert.match(catchBlock[1], /refreshParseAndRevision|refreshParse|readNamespace/, 'the catch must refresh revision/parse state')
})

test('R4: saveEngine validates gates and enforces MAX_GATES before mutating', () => {
  const region = saveEngineRegion()
  assert.match(region, /MAX_GATES/, 'the save path must check the gate cap')
  const validateAt = region.search(/validate[A-Za-z]*\s*\(/)
  const writeAt = region.indexOf('writeNamespaceFields')
  assert.ok(validateAt >= 0, 'the save path must validate gates')
  assert.ok(writeAt > validateAt, 'validation must happen before the mutate call')
})

// ---------------------------------------------------------------------------
// Evaluator compatibility (existing behaviour must not change)
// ---------------------------------------------------------------------------

function gate(overrides = {}) {
  return {
    id: 'checks-passed',
    deny: { role: 'dev', tool: ['bash', 'pwsh'], commandPattern: '\\bpnpm\\s+test\\b' },
    require: { event: 'checks-passed', byRoles: ['tse'], freshFor: 60 },
    description: 'test gate',
    ...overrides,
  }
}

test('evaluateGates still skips an invalid gate instead of throwing', () => {
  const decision = evaluateGates({
    gates: [{ id: 'broken', deny: {}, require: {} }, gate()],
    role: 'dev',
    tool: 'pwsh',
    args: { command: 'pnpm test' },
    ledger: new GateLedger(),
    teamId: 'team-1',
  })
  assert.equal(decision?.kind, 'deny')
  assert.match(decision.reason, /checks-passed/)
})

test('evaluateGates still ignores gateParse-shaped fields (they never participate)', () => {
  const decision = evaluateGates({
    gates: [gate()],
    role: 'dev',
    tool: 'pwsh',
    args: { command: 'pnpm test' },
    ledger: new GateLedger(),
    teamId: 'team-1',
    gateParseRequest: { nonce: 'x', text: 'y', at: 1 },
    gateParseResult: { status: 'ok' },
  })
  assert.equal(decision?.kind, 'deny')
})
