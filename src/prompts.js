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
export function leadCatalog(roles, playbook = '') {
  const lines = [
    '## Role-based teammate spawning',
    '',
    'This Agent Team spawns teammates from configured role presets. Call `spawn_team_member` with a `role` id; it applies that role\'s prompt, model route, tool policy, and skills. `spawn_teammate` is disabled in this Team — do not call it.',
    '',
    'To move an EXISTING teammate between its role\'s primary and fallback model route (for example after a model quota failure), call `switch_member_model` with its member name and `route: "fallback"` or `"primary"`. The member keeps its conversation context; never spawn a replacement to change models.',
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
    'Use the role id as the teammate name when the role has no other instance. If a healthy member of the requested role already exists, `spawn_team_member` reuses it and sends the prompt as a task; it creates a new member only when that role has no healthy member. A taken name then gets a numeric suffix.',
    '',
    'When the user states a lasting requirement for one role — including "from now on", "always", or "never" — record it with `record_role_feedback`. Do not treat a task-local instruction as a lasting rule.',
    '',
    'Role rules are for durable role behavior only. Never store project-specific facts (brand names, domains, schemas, environment, versions, file paths) in role prompts or role rules; record those in the project memory vault with `memory_capture` instead.',
    '',
    '## Scheduling and waiting',
    'Dispatch every independent task first. Multiple spawn_team_member / send_message calls may run in one step; do not wait for one member before dispatching the next.',
    'After dispatching, end your turn instead of calling wait_agent; teammate messages and status changes wake you.',
    'Use wait_agent only when the next action truly depends on a member result and nothing else can be dispatched. Keep timeout_ms at or below 30000 and never poll with repeated long waits.',
  )
  if (typeof playbook === 'string' && playbook.trim() !== '') {
    lines.push('', '## Orchestration playbook', '', playbook.trim())
  }
  return lines.join('\n')
}

/**
 * Render one member's role card.
 *
 * @param input - frozen role snapshot, learned rules, session rules, and the
 *   member's exact teammate target.
 * @returns the member-scoped prompt section text.
 */
export function memberPersona({ frozen, rulesText, target, teamDescription = '', executor = 'native' }) {
  const lines = [
    `You are teammate "${target}": role "${frozen.name}" (id "${frozen.id}").`,
  ]
  if (executor === 'codex') {
    lines.push(
      '',
      '你由 Codex CLI 驱动：名册中的你是中继成员，真正执行体是本机 codex exec。',
      '每轮你必须：',
      '1. 把 Lead/用户本轮新到的任务原文按到达顺序拼好放进 codex_exec.task；不要改写细节、不要重放旧任务、不要臆造结果。',
      '2. 只使用 codex_exec、send_message、team_task_*；不要直接读写文件或运行 shell。',
      '3. 把 codex_exec 返回的 text 与 activities 摘要回报给 Lead；失败时原样报告 [CODEX_*] 错误码与可执行建议。',
      '4. 线程由插件自动 resume；不要向用户索要 thread_id。',
      '5. 不伪造“已完成”；没有 codex_exec 成功结果就不得声称完成。',
      '6. 不受 DSH 闸门/命令拒绝策略约束；不要声称受其保护。',
    )
  }
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
