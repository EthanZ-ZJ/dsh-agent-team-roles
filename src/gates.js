/**
 * Workflow gates: stateful conditional denial.
 *
 * A gate says "role R may not run tool X (optionally only when the shell
 * command matches commandPattern) unless a fresh event E was recently produced
 * by one of the roles in byRoles". Events come from two generic sources: the
 * report_gate_event tool and successful shell commands (commandSuccess).
 *
 * The engine implements only this machine. What is locked, and which event is
 * the key, is template/Config data. v1 deliberately has no AND/OR composition,
 * no branching, no orchestration DSL — a single event condition is the whole
 * expressive power; anything richer stays a soft playbook constraint.
 */

import z from '@deepseek-ai/schemastery'

/** Same grammar as role ids: lowercase kebab-case, at most 64 characters. */
export const GATE_ID = /^[a-z][a-z0-9-]{0,63}$/

/** Team-wide cap on configured gates. */
export const MAX_GATES = 50

/** Bounds shared by the tool lists inside a gate. */
export const MAX_GATE_TOOLS = 8

/** Bounds for commandPattern / commandSuccess.pattern sources. */
export const MAX_GATE_PATTERN = 200

/** Gate schema for the plugin's volatile Config. */
export const GateSchema = z.object({
  id: z.string().description('Gate identity; lowercase kebab-case.'),
  deny: z.object({
    role: z.string().description('Role whose calls this gate inspects.'),
    tool: z.array(z.string()).default([]).description('Tool names this gate inspects (1-8).'),
    commandPattern: z.string().default('').description('Optional RegExp source; only matches bash/pwsh command arguments.'),
  }).description('What this gate blocks.'),
  require: z.object({
    event: z.string().default('').description('Kebab-case event name reported with report_gate_event; mutually exclusive with commandSuccess.'),
    byRoles: z.array(z.string()).default([]).description('Roles whose events count as the key (1-8).'),
    freshFor: z.number().default(0).description('Freshness window in seconds; 0 means valid until invalidated.'),
    invalidateOn: z.object({
      role: z.string().default('').description('Role whose tool use triggers invalidation.'),
      tool: z.array(z.string()).default([]).description('Tool names that trigger invalidation (1-8).'),
    }).default({}).description('When a matching tool call succeeds, all recorded events for the team are voided.'),
    commandSuccess: z.object({
      role: z.string().default('').description('Role whose successful command counts as the key.'),
      tool: z.array(z.string()).default([]).description('Shell tool names to watch (1-8; bash/pwsh only).'),
      pattern: z.string().default('').description('RegExp source matched against the command string.'),
    }).default({}).description('Successful-command key; mutually exclusive with event.'),
  }).description('The key this gate demands before letting the call through.'),
  description: z.string().default('').description('Human-readable summary for /team-gates.'),
})

/** Trim one text value, falling back to an empty string. */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Normalize a tool-name list: dedupe, keep order, at most 8 entries. */
function toolList(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(text).filter(Boolean))].slice(0, MAX_GATE_TOOLS)
    : []
}

/** Normalize one gate into the canonical shape the evaluator reads. */
export function normalizeGate(input) {
  const gate = input !== null && typeof input === 'object' ? input : {}
  const deny = gate.deny !== null && typeof gate.deny === 'object' ? gate.deny : {}
  const require = gate.require !== null && typeof gate.require === 'object' ? gate.require : {}
  const commandSuccess = require.commandSuccess !== null && typeof require.commandSuccess === 'object'
    ? require.commandSuccess
    : {}
  const invalidateOn = require.invalidateOn !== null && typeof require.invalidateOn === 'object'
    ? require.invalidateOn
    : {}
  const id = text(gate.id).toLowerCase()
  const commandPattern = text(deny.commandPattern)
  return {
    id,
    deny: {
      role: text(deny.role).toLowerCase(),
      tool: toolList(deny.tool),
      ...(commandPattern === '' ? {} : { commandPattern }),
    },
    require: {
      ...(text(require.event) === '' ? {} : { event: text(require.event).toLowerCase() }),
      byRoles: toolList(require.byRoles).map((role) => role.toLowerCase()),
      ...(Number.isFinite(require.freshFor) && require.freshFor > 0 ? { freshFor: require.freshFor } : {}),
      ...(text(invalidateOn.role) === '' && !Array.isArray(invalidateOn.tool)
        ? {}
        : {
            invalidateOn: {
              ...(text(invalidateOn.role) === '' ? {} : { role: text(invalidateOn.role).toLowerCase() }),
              tool: toolList(invalidateOn.tool),
            },
          }),
      ...(text(commandSuccess.role) === ''
        ? {}
        : {
            commandSuccess: {
              role: text(commandSuccess.role).toLowerCase(),
              tool: toolList(commandSuccess.tool),
              pattern: text(commandSuccess.pattern),
            },
          }),
    },
    description: text(gate.description),
  }
}

/** Canonical ledger event name for a commandSuccess requirement. */
export function commandSuccessEvent(gateId) {
  return `gate:${gateId}:command-success`
}

/** Resolve the key a gate demands: {event, byRoles, freshFor} or {commandSuccess}. */
export function gateRequirement(gate) {
  if (gate.require.commandSuccess !== undefined) return { commandSuccess: gate.require.commandSuccess }
  if (gate.require.event !== undefined) {
    return { event: gate.require.event, byRoles: gate.require.byRoles, freshFor: gate.require.freshFor }
  }
  return undefined
}

/** Report the first validation failure of one gate, or undefined when valid. */
export function validateGate(gate) {
  if (!GATE_ID.test(gate.id)) return `gate id "${gate.id}" must be lowercase kebab-case (letters, digits, hyphens; at most 64 characters)`
  if (gate.deny.role === '') return `gate "${gate.id}" deny.role is required`
  if (gate.deny.tool.length === 0) return `gate "${gate.id}" deny.tool must list at least one tool`
  if (gate.deny.commandPattern !== undefined) {
    if (gate.deny.commandPattern.length > MAX_GATE_PATTERN) {
      return `gate "${gate.id}" commandPattern exceeds ${MAX_GATE_PATTERN} characters`
    }
    try {
      // eslint-disable-next-line no-new
      new RegExp(gate.deny.commandPattern)
    } catch {
      return `gate "${gate.id}" commandPattern is not a valid regex: ${gate.deny.commandPattern}`
    }
  }
  const hasEvent = gate.require.event !== undefined
  const hasCommand = gate.require.commandSuccess !== undefined
  if (hasEvent && hasCommand) return `gate "${gate.id}" cannot require both an event and a commandSuccess`
  if (!hasEvent && !hasCommand) return `gate "${gate.id}" must require an event or a commandSuccess`
  if (hasEvent) {
    if (!GATE_ID.test(gate.require.event)) return `gate "${gate.id}" event must be lowercase kebab-case (at most 64 characters)`
    if (gate.require.byRoles.length === 0) return `gate "${gate.id}" require.byRoles must list at least one role`
  }
  if (hasCommand) {
    const command = gate.require.commandSuccess
    if (command.role === '') return `gate "${gate.id}" commandSuccess.role is required`
    if (command.tool.length === 0) return `gate "${gate.id}" commandSuccess.tool must list at least one shell tool`
    if (command.pattern.length > MAX_GATE_PATTERN) {
      return `gate "${gate.id}" commandSuccess.pattern exceeds ${MAX_GATE_PATTERN} characters`
    }
    try {
      // eslint-disable-next-line no-new
      new RegExp(command.pattern)
    } catch {
      return `gate "${gate.id}" commandSuccess.pattern is not a valid regex: ${command.pattern}`
    }
  }
  if (gate.require.invalidateOn !== undefined && gate.require.invalidateOn.tool.length === 0) {
    return `gate "${gate.id}" invalidateOn.tool must list at least one tool`
  }
  return undefined
}

/** Normalize a gate list: dedupe by id keeping the first, cap at MAX_GATES. */
export function normalizeGates(input) {
  const gates = []
  const seen = new Set()
  for (const candidate of Array.isArray(input) ? input : []) {
    const gate = normalizeGate(candidate)
    if (gate.id === '' || seen.has(gate.id)) continue
    seen.add(gate.id)
    gates.push(gate)
    if (gates.length >= MAX_GATES) break
  }
  return gates
}

/** Extract the shell command string from tool arguments, tolerating JSON strings. */
export function commandFromArgs(args) {
  let parsed = args
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return undefined
    }
  }
  const command = parsed?.command
  return typeof command === 'string' ? command : undefined
}

/** Whether a deny entry applies to this dispatch (role, tool, optional pattern). */
function denyMatches(gate, role, tool, command) {
  if (gate.deny.role !== role) return false
  if (!gate.deny.tool.includes(tool)) return false
  const pattern = gate.deny.commandPattern
  if (pattern === undefined) return true
  if (tool !== 'bash' && tool !== 'pwsh') return false
  return typeof command === 'string' && new RegExp(pattern).test(command)
}

/** Human summary of the freshest matching event, for rejection reasons. */
function currentState(ledger, teamId, event, byRoles) {
  const latest = ledger.latest?.(teamId, event, byRoles)
  if (latest === undefined) return 'none'
  return `'${latest.event}' by ${latest.role}`
}

/**
 * Evaluate gates against one dispatch.
 *
 * Returns a pre-execute deny decision ({kind:'deny', reason, info}) when a
 * configured, enabled gate applies and its key is missing; undefined otherwise.
 * Pure: all state arrives via `ledger`, time via `now`.
 */
export function evaluateGates({ gates, disabled = [], role, tool, args, ledger, teamId, now = Date.now() }) {
  const command = commandFromArgs(args)
  for (const raw of Array.isArray(gates) ? gates : []) {
    const gate = normalizeGate(raw)
    if (gate.id === '') continue
    if (disabled.includes(gate.id)) continue
    if (!denyMatches(gate, role, tool, command)) continue
    const requirement = gateRequirement(gate)
    if (requirement === undefined) continue
    const event = requirement.commandSuccess !== undefined
      ? commandSuccessEvent(gate.id)
      : requirement.event
    const byRoles = requirement.commandSuccess !== undefined
      ? [requirement.commandSuccess.role]
      : requirement.byRoles
    const freshFor = requirement.freshFor
    const fresh = ledger.fresh(teamId, event, byRoles, freshFor, now)
    if (fresh !== undefined) continue
    const missing = requirement.commandSuccess !== undefined
      ? `no successful '${requirement.commandSuccess.tool.join('/')}' command from role '${requirement.commandSuccess.role}' matching the required pattern`
      : `no fresh '${requirement.event}' event from roles [${requirement.byRoles.join(', ')}]`
    const howTo = requirement.commandSuccess !== undefined
      ? `Ask role '${requirement.commandSuccess.role}' to run the required command successfully`
      : `Ask role ${requirement.byRoles.map((item) => `'${item}'`).join(' or ')} to run report_gate_event({ event: '${requirement.event}' })`
    const reason = `Blocked by gate '${gate.id}': ${missing}. ${howTo}, then retry. ` +
      `Current state: ${currentState(ledger, teamId, event, byRoles)}.` +
      (gate.description === '' ? '' : ` Gate: ${gate.description}`)
    return { kind: 'deny', reason, info: { name: 'GateDenied', code: 'GATE_KEY_REQUIRED', gateId: gate.id } }
  }
  return undefined
}
