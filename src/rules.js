/**
 * Pure learned-rule logic: validation, de-duplication, evidence, promotion,
 * conflicts, and prompt rendering.
 *
 * A rule is one user requirement a role should keep following. `permanent`
 * rules are active immediately, `candidate` rules need a second observation or
 * a review action, and `session` rules live only in memory for one Session.
 */

/** Maximum number of persistent rules kept per role. */
export const MAX_RULES_PER_ROLE = 40

/** Maximum length of one rule's text. */
export const MAX_RULE_TEXT = 600

/** Evidence count that promotes a candidate rule to active. */
export const PROMOTION_EVIDENCE = 2

/** Allowed rule polarities. */
export const POLARITIES = ['do', 'dont', 'preference']

/** Allowed persistent rule statuses. */
export const STATUSES = ['candidate', 'active', 'superseded']

/** Normalize rule text for storage and duplicate comparison. */
export function normalizeRuleText(value) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : ''
}

/** Normalize one stored rule; malformed entries are dropped by callers. */
export function normalizeRule(input) {
  const rule = input !== null && typeof input === 'object' ? input : {}
  const text = normalizeRuleText(rule.text)
  if (text === '') return undefined
  const polarity = POLARITIES.includes(rule.polarity) ? rule.polarity : 'preference'
  const status = STATUSES.includes(rule.status) ? rule.status : 'candidate'
  return {
    id: typeof rule.id === 'string' && rule.id !== '' ? rule.id : undefined,
    roleId: typeof rule.roleId === 'string' ? rule.roleId.trim() : '',
    text,
    polarity,
    status,
    evidence: Number.isSafeInteger(rule.evidence) && rule.evidence > 0 ? rule.evidence : 1,
    source: typeof rule.source === 'string' ? rule.source : 'lead',
    createdAt: Number.isFinite(rule.createdAt) && rule.createdAt > 0 ? rule.createdAt : Date.now(),
    updatedAt: Number.isFinite(rule.updatedAt) && rule.updatedAt > 0 ? rule.updatedAt : Date.now(),
  }
}

/** Normalize a stored rule list, dropping entries without identity or role. */
export function normalizeRules(input) {
  const rules = []
  for (const candidate of Array.isArray(input) ? input : []) {
    const rule = normalizeRule(candidate)
    if (rule === undefined || rule.id === undefined || rule.roleId === '') continue
    rules.push(rule)
  }
  return rules
}

/** Find one rule by identity. */
export function findRule(rules, id) {
  return rules.find((rule) => rule.id === id)
}

/** List rules for one role, optionally filtered by status. */
export function rulesForRole(rules, roleId, statuses = STATUSES) {
  return rules.filter((rule) => rule.roleId === roleId && statuses.includes(rule.status))
}

/** Whether the role already has the maximum number of persistent rules. */
function atLimit(rules, roleId, replacingId) {
  const count = rules.filter(
    (rule) =>
      rule.roleId === roleId &&
      rule.status !== 'superseded' &&
      rule.id !== replacingId,
  ).length
  return count >= MAX_RULES_PER_ROLE
}

/**
 * Apply one persistent rule observation.
 *
 * @param rules - current persistent rules.
 * @param input - the observation: role, text, polarity, scope (`permanent` or
 *   `candidate`), source, and a caller-supplied id.
 * @param now - timestamp used for created/updated fields.
 * @returns the next rule list, the affected rule, whether it was promoted, and
 *   a refusal reason when the observation cannot be stored.
 */
export function applyRule(rules, input, now = Date.now()) {
  const current = normalizeRules(rules)
  const roleId = typeof input.roleId === 'string' ? input.roleId.trim() : ''
  const text = normalizeRuleText(input.text)
  if (roleId === '') return { rules: current, refusal: 'rule roleId is required' }
  if (text === '') return { rules: current, refusal: 'rule text is required' }
  if (text.length > MAX_RULE_TEXT) {
    return { rules: current, refusal: `rule text exceeds ${MAX_RULE_TEXT} characters` }
  }
  const polarity = POLARITIES.includes(input.polarity) ? input.polarity : 'preference'
  const scope = input.scope === 'candidate' ? 'candidate' : 'permanent'
  const source = typeof input.source === 'string' ? input.source : 'lead'

  const duplicate = current.find(
    (rule) =>
      rule.roleId === roleId &&
      rule.text.toLocaleLowerCase() === text.toLocaleLowerCase() &&
      rule.status !== 'superseded',
  )

  if (duplicate !== undefined) {
    if (duplicate.polarity !== polarity) {
      // A later requirement with the opposite direction supersedes the old one
      // instead of leaving two contradictory instructions in the prompt.
      const next = current.map((rule) =>
        rule.id === duplicate.id
          ? { ...rule, status: 'superseded', updatedAt: now }
          : rule,
      )
      if (atLimit(next, roleId, undefined)) {
        return { rules: current, refusal: `role "${roleId}" reached ${MAX_RULES_PER_ROLE} rules` }
      }
      const created = {
        id: input.id,
        roleId,
        text,
        polarity,
        status: scope === 'permanent' ? 'active' : 'candidate',
        evidence: 1,
        source,
        createdAt: now,
        updatedAt: now,
      }
      return {
        rules: [...next, created],
        rule: created,
        promoted: created.status === 'active',
      }
    }

    const evidence = duplicate.evidence + 1
    const shouldPromote =
      duplicate.status === 'candidate' &&
      (scope === 'permanent' || evidence >= PROMOTION_EVIDENCE)
    const updated = {
      ...duplicate,
      status: shouldPromote ? 'active' : duplicate.status,
      evidence,
      updatedAt: now,
      source,
    }
    return {
      rules: current.map((rule) => (rule.id === duplicate.id ? updated : rule)),
      rule: updated,
      promoted: shouldPromote,
    }
  }

  if (atLimit(current, roleId, undefined)) {
    return { rules: current, refusal: `role "${roleId}" reached ${MAX_RULES_PER_ROLE} rules` }
  }
  const created = {
    id: input.id,
    roleId,
    text,
    polarity,
    status: scope === 'permanent' ? 'active' : 'candidate',
    evidence: 1,
    source,
    createdAt: now,
    updatedAt: now,
  }
  return {
    rules: [...current, created],
    rule: created,
    promoted: created.status === 'active',
  }
}

/** Add one in-memory session rule, returning the next list. */
export function applySessionRule(rules, input, now = Date.now()) {
  const text = normalizeRuleText(input.text)
  if (text === '') return { rules, refusal: 'rule text is required' }
  if (text.length > MAX_RULE_TEXT) {
    return { rules, refusal: `rule text exceeds ${MAX_RULE_TEXT} characters` }
  }
  const roleId = typeof input.roleId === 'string' ? input.roleId.trim() : ''
  if (roleId === '') return { rules, refusal: 'rule roleId is required' }
  const duplicate = rules.find(
    (rule) =>
      rule.roleId === roleId &&
      rule.text.toLocaleLowerCase() === text.toLocaleLowerCase(),
  )
  if (duplicate !== undefined) {
    const updated = { ...duplicate, evidence: duplicate.evidence + 1, updatedAt: now }
    return {
      rules: rules.map((rule) => (rule.id === duplicate.id ? updated : rule)),
      rule: updated,
    }
  }
  const created = {
    id: input.id,
    roleId,
    text,
    polarity: POLARITIES.includes(input.polarity) ? input.polarity : 'preference',
    status: 'active',
    evidence: 1,
    source: typeof input.source === 'string' ? input.source : 'lead',
    createdAt: now,
    updatedAt: now,
  }
  return { rules: [...rules, created], rule: created }
}

/** Remove one persistent rule by identity. */
export function removeRule(rules, id) {
  const found = findRule(rules, id)
  if (found === undefined) return { rules, removed: false }
  return {
    rules: rules.filter((rule) => rule.id !== id),
    removed: true,
    rule: found,
  }
}

/** Render the active standing instructions for one role. */
export function renderRules(rules, roleId, sessionRules = []) {
  const active = [...rulesForRole(rules, roleId, ['active']), ...sessionRules.filter(
    (rule) => rule.roleId === roleId && rule.status === 'active',
  )].sort((left, right) => left.createdAt - right.createdAt)
  if (active.length === 0) return ''
  const lines = active.map((rule) => `- ${rule.text}`)
  return [
    'Standing instructions learned from user feedback. Follow them; they refine the role defaults above.',
    ...lines,
  ].join('\n')
}

/** Describe one rule for a tool result. */
export function ruleView(rule) {
  return {
    id: rule.id,
    roleId: rule.roleId,
    text: rule.text,
    polarity: rule.polarity,
    status: rule.status,
    evidence: rule.evidence,
    source: rule.source,
  }
}
