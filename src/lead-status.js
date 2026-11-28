import { z } from 'zod'

export const LEAD_STATUS_TOOL = 'update_lead_status'
const STATUS_KIND = 'agent-team-lead-status'
const FIELDS = {
  goal: { limit: 240, description: 'Current user objective in plain text (max 240 characters).' },
  summary: { limit: 360, description: 'Latest round: what changed, was verified, or is blocked (max 360 characters).' },
  next: { limit: 240, description: 'Next action, pending decision, or empty when there is none (max 240 characters).' },
}
const REQUIRED_FIELDS = ['goal', 'summary']
const plainText = (min, max) => z.string().min(min).max(max)
  .regex(/^[^\u0000-\u001F\u007F-\u009F\u2028\u2029]*$/u, 'Use one line of plain text.')
  .refine((text) => text === text.trim(), 'Use trimmed text.')
const statusFields = z.strictObject({
  goal: plainText(1, FIELDS.goal.limit),
  summary: plainText(1, FIELDS.summary.limit),
  next: plainText(0, FIELDS.next.limit),
})
const argsSchema = z.strictObject({
  goal: z.string().max(FIELDS.goal.limit).trim().pipe(statusFields.shape.goal),
  summary: z.string().max(FIELDS.summary.limit).trim().pipe(statusFields.shape.summary),
  next: z.string().max(FIELDS.next.limit).trim().pipe(statusFields.shape.next).default(''),
})
const resultSchema = statusFields.extend({ kind: z.literal(STATUS_KIND) })
const position = z.number().int().nonnegative()
const boundary = z.strictObject({ currentTurn: position, running: z.boolean() })
const statusView = statusFields.extend({
  ...boundary.shape,
  updatedAt: position,
  updatedTurn: position,
})
const statusState = z.strictObject({
  inheritedEventCount: position,
  progress: z.union([statusView, boundary]),
  lastUpdateCallSeq: position.nullable(),
  pending: z.array(z.strictObject({
    callId: z.string().min(1),
    seq: position,
    step: position,
    fields: statusFields,
  })),
})
const viewOf = (state) => ('goal' in state.progress ? state.progress : null)
const isPosition = (value) => Number.isSafeInteger(value) && value >= 0

export const leadStatusPrompt = [
  '### Team Lead status and decisions',
  'In the user’s language, call `update_lead_status` before ending every turn, even if nothing changed. Put the current objective in `goal`, what happened this round in `summary`, and the next action or open blocker in `next`. Keep it factual; a status update is not a user answer.',
  'Before asking the user about a blocker, first complete an `update_lead_status` call. Use the native `ask_user_question` tool for approvals or decisions instead of asking only in chat. Offer explicit choices, including a way to decline when asking for approval.',
  'In each option’s `description`, use exactly two separate lines with concrete tradeoffs: `Pro: ...` then `Con: ...` (Chinese: `优点：...` then `代价：...`). Write the tradeoffs in the user’s language.',
  'A skipped, pending, timed-out, or cancelled question is never permission. Continue only independent work until the user explicitly approves the dependent action.',
].join('\n')

// The executor enforces types and required fields using its supported JSON
// Schema subset. Text lengths, trimming and single-line validation use Zod.
const parameters = Object.fromEntries(Object.entries(FIELDS).map(([name, field]) =>
  [name, { type: 'string', description: field.description }]))

/** The tool only renders a status. The native executor alone commits the result. */
export function createLeadStatusTool(canUpdate) {
  return {
    name: LEAD_STATUS_TOOL,
    description: 'Record the current Team Lead objective, latest progress, and next action for this session.',
    parameters: { type: 'object', properties: parameters, required: REQUIRED_FIELDS, additionalProperties: false },
    output: {
      schema: {
        type: 'object',
        properties: { kind: { type: 'string', const: STATUS_KIND }, ...parameters },
        required: ['kind', ...Object.keys(FIELDS)],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!canUpdate(exec?.agent)) throw new Error('Only the active Team Lead can record this session’s status.')
      return { kind: STATUS_KIND, ...argsSchema.parse(args) }
    },
  }
}

// Allow room for JSON escapes while bounding what the fold will parse.
const MAX_JSON_LENGTH = 6 * Object.values(FIELDS).reduce((sum, field) => sum + field.limit, 0) + 256
function parseJson(schema, text) {
  if (typeof text !== 'string' || text.length > MAX_JSON_LENGTH) return null
  try {
    const result = schema.safeParse(JSON.parse(text))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function apply(state, event) {
  if (event.seq < state.inheritedEventCount) return state
  const { progress, pending } = state
  const turn = event.data?.turn
  if (!isPosition(turn)) return state
  switch (event.type) {
    case 'turn/start':
      if (turn <= progress.currentTurn) return state
      return { ...state, progress: { ...progress, currentTurn: turn, running: true }, pending: [] }
    case 'turn/end':
      if (turn < progress.currentTurn || (turn === progress.currentTurn && !progress.running)) return state
      return { ...state, progress: { ...progress, currentTurn: turn, running: false }, pending: [] }
    case 'tool/call': {
      if (!progress.running || turn !== progress.currentTurn || event.data.name !== LEAD_STATUS_TOOL) return state
      const { callId, step } = event.data
      if (typeof callId !== 'string' || callId === '' || !isPosition(step)) return state
      const fields = parseJson(argsSchema, event.data.arguments)
      if (fields === null) return state
      return { ...state, pending: [...pending, { callId, step, seq: event.seq, fields }] }
    }
    case 'tool/result': {
      if (!progress.running || turn !== progress.currentTurn || pending.length === 0) return state
      const { step, message, error } = event.data
      const source = event.sourceEventSeqs
      const index = pending.findIndex((call) => call.callId === message?.toolCallId && call.step === step
        && (source === undefined || (source.length === 1 && source[0] === call.seq)))
      if (index < 0) return state
      const call = pending[index]
      const settled = { ...state, pending: pending.filter((_, i) => i !== index) }
      if (error !== undefined || message.isError === true || !isPosition(event.time)
        || (state.lastUpdateCallSeq !== null && call.seq <= state.lastUpdateCallSeq)) return settled
      const content = message.content
      if (!Array.isArray(content) || content.length !== 1 || content[0]?.type !== 'text') return settled
      const value = parseJson(resultSchema, content[0].text)
      if (value === null || Object.keys(FIELDS).some((name) => value[name] !== call.fields[name])) return settled
      return {
        ...settled,
        lastUpdateCallSeq: call.seq,
        progress: { ...call.fields, updatedAt: event.time, updatedTurn: turn, currentTurn: turn, running: true },
      }
    }
    default:
      return state
  }
}

/** Complete, detail-only session view. Forks do not inherit the source Lead’s status. */
export const leadStatusProjection = {
  key: 'agentTeamLeadStatus',
  stateVersion: 1,
  stateSchema: statusState,
  init: (_header, inheritedEventCount) => ({
    inheritedEventCount,
    progress: { currentTurn: 0, running: false },
    lastUpdateCallSeq: null,
    pending: [],
  }),
  apply,
  wire: { summary: false, viewSchema: statusView.nullable(), view: viewOf },
}
