/** Static contracts for the manual gate editor and evaluator. */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { MAX_GATES, evaluateGates } from '../src/gates.js'
import { GateLedger } from '../src/ledger.js'

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8')

const clientSrc = read('../client.js')
const pluginSrc = read('../src/plugin.js')
const gatesSrc = read('../src/gates.js')
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
test('zh and en dictionaries are paired key-for-key', () => {
  const zhKeys = Object.keys(zhDict).sort()
  const enKeys = Object.keys(enDict).sort()
  assert.deepEqual(zhKeys, enKeys, 'every locale key must exist in both dictionaries')
})
test('the client writes the gates field only from saveEngine', () => {
  const writes = [...clientSrc.matchAll(/field:\s*'gates'/g)].map((match) => match.index)
  assert.equal(writes.length, 1, 'exactly one write site for gates')
  const start = clientSrc.indexOf('const saveEngine')
  const end = start + 4200
  assert.ok(writes[0] > start && writes[0] < end, 'the only gates write lives in saveEngine')
})
function saveEngineRegion() {
  const start = clientSrc.indexOf('const saveEngine')
  assert.ok(start >= 0, 'client.js must keep a saveEngine function')
  const end = clientSrc.indexOf('const markDirty', start)
  return clientSrc.slice(start, end > start ? end : start + 8000)
}

test('the saveEngine failure path refreshes revision without reloading over local edits', () => {
  const region = saveEngineRegion()
  const catchBlock = /catch\s*\([^)]*\)\s*\{([\s\S]{0,900}?)\n\s*\}\s*(?:finally|\n)/.exec(region)
  assert.ok(catchBlock, 'saveEngine must keep a try/catch/finally')
  assert.doesNotMatch(catchBlock[1], /await\s+load\s*\(/, 'R1 regression: the catch must not await load()')
  assert.match(catchBlock[1], /refresh[A-Za-z]*Revision|readNamespace/, 'the catch must refresh the revision')
})

test('saveEngine validates gates and enforces MAX_GATES before mutating', () => {
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
test('evaluateGates ignores legacy parser data', () => {
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
