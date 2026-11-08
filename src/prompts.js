/**
 * Model-facing prompt text built from the role catalog and learned rules.
 *
 * The member persona section is registered with a text callback, so the runtime
 * re-reads the rule store on every assembly. A rule recorded during a turn is
 * visible to the next model step without re-spawning the member.
 */

/** Render the live roster rows the Lead should already know about. */
export function activeMembers(rows) {
  const lines = ['## Active team members', '']
  if (rows.length === 0) {
    lines.push('No teammates are active yet. Pull one from the composer or call `spawn_team_member` with a configured role.')
    return lines.join('\n')
  }
  lines.push(
    'These teammates already exist in this Team. Assign work to them with `send_message` or the Team task board; do not spawn a duplicate just because a member is quiet.',
  )
  for (const row of rows) {
    const role = row.role
    const label = role === undefined ? 'unmanaged role' : `${role.name} (${role.id})`
    const description = role?.description || row.description || ''
    const suffix = description === '' ? '' : ` — ${description}`
    lines.push(`- ${row.name}: ${label}${suffix} [${row.status ?? 'unknown'}]`)
  }
  lines.push('', 'Use `list_team_roles` for full role prompts, tool policies, and skills.')
  return lines.join('\n')
}

/** Render the Lead's role catalog and spawning instructions. */
export function leadCatalog(roles) {
  const lines = [
    '## Role-based teammate spawning',
    '',
    'This Agent Team spawns teammates from configured role presets. Call `spawn_team_member` with a `role` id; it applies that role\'s prompt, model route, tool policy, and skills. `spawn_teammate` is disabled in this Team — do not call it.',
    '',
    'Configured roles:',
  ]
  for (const role of roles) {
    const label = role.name === role.id ? role.id : `${role.name} (${role.id})`
    const description = role.description === '' ? '' : `: ${role.description}`
    lines.push(`- ${label}${description}`)
  }
  lines.push(
    '',
    'Use `list_team_roles` to inspect the full role definitions. Create a missing role with `create_team_role`; update and delete are Lead-only.',
    '',
    'Use the role id as the teammate name when the role has no other instance. When a role is reused, `spawn_team_member` adds a numeric suffix automatically.',
    '',
    'When the user states a lasting requirement for one role — including "from now on", "always", or "never" — record it with `record_role_feedback`. Do not treat a task-local instruction as a lasting rule.',
  )
  return lines.join('\n')
}

/**
 * Render one member's role card.
 *
 * @param input - frozen role snapshot, learned rules, session rules, and the
 *   member's exact teammate target.
 * @returns the member-scoped prompt section text.
 */
export function memberPersona({ frozen, rulesText, target, teamDescription = '' }) {
  const lines = [
    `You are teammate "${target}": role "${frozen.name}" (id "${frozen.id}").`,
  ]
  if (frozen.description !== '') {
    lines.push('', frozen.description)
  }
  if (teamDescription !== '') {
    lines.push('', `Team purpose: ${teamDescription}`)
  }
  if (frozen.persona !== '') {
    lines.push('', frozen.persona)
  }
  if (rulesText !== '') {
    lines.push('', rulesText)
  }
  lines.push(
    '',
    'First-turn handshake rule: if the initial user message contains [[TEAM_HANDSHAKE]], reply with exactly READY and nothing else. Do not call tools, analyze, ask questions, or send a report on that turn.',
    '',
    'Work only within this role. Report completed work, files changed, checks run, and remaining risks to the Team Lead.',
  )
  return lines.join('\n')
}

/** Render a compact rule list for tool results. */
export function ruleSummary(roleId, rules) {
  if (rules.length === 0) return `role "${roleId}" has no learned rules`
  return rules
    .map((rule) => `- [${rule.status}] ${rule.text} (${rule.source}, evidence ${rule.evidence})`)
    .join('\n')
}
