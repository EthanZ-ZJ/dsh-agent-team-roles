/**
 * Model-facing tools: role-based spawning on the Lead side, and self-learning
 * rules on both sides.
 *
 * The tools are registered into one exact Agent scope. Their execute functions
 * close over the plugin's live Config readers, so an edited role or a newly
 * learned rule applies to the next call without restarting the plugin.
 */

import { findRole, mergeRoles, roleForTarget } from './config.js'
import { ruleView } from './rules.js'
import { spawnRoleMember } from './spawn.js'

/** Resolve a configured role or throw a model-facing list of known ids. */
function requireRole(roles, id) {
  const role = findRole(roles, id)
  if (role !== undefined) return role
  const available = roles.map((candidate) => candidate.id).join(', ')
  throw new Error(`unknown role "${id}"; configured roles: ${available}`)
}

/** Convert one compact parameter spec into the JSON Schema the registry wants. */
function parameterSchema(parameters) {
  const properties = {}
  const required = []
  for (const [name, spec] of Object.entries(parameters)) {
    properties[name] = {
      type: spec.type,
      ...(spec.description === undefined ? {} : { description: spec.description }),
      ...(spec.enum === undefined ? {} : { enum: spec.enum }),
      ...(spec.items === undefined ? {} : { items: spec.items }),
    }
    if (spec.required === true) required.push(name)
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    ...(required.length === 0 ? {} : { required }),
  }
}

/** Reject a call whose arguments do not match the declared compact spec. */
function validateArguments(parameters, args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('tool arguments must be an object')
  }
  for (const [name, spec] of Object.entries(parameters)) {
    const value = args[name]
    if (value === undefined) {
      if (spec.required === true) throw new Error(`argument "${name}" is required`)
      continue
    }
    if (spec.type === 'string' && typeof value !== 'string') {
      throw new Error(`argument "${name}" must be a string`)
    }
    if (spec.type === 'integer' && !Number.isSafeInteger(value)) {
      throw new Error(`argument "${name}" must be an integer`)
    }
    if (spec.type === 'array') {
      if (!Array.isArray(value)) throw new Error(`argument "${name}" must be an array`)
      const itemType = spec.items?.type
      if (itemType === 'string' && value.some((item) => typeof item !== 'string')) {
        throw new Error(`argument "${name}" must contain only strings`)
      }
    }
    if (spec.enum !== undefined && !spec.enum.includes(value)) {
      throw new Error(`argument "${name}" must be one of ${spec.enum.join(', ')}`)
    }
  }
  for (const name of Object.keys(args)) {
    if (!(name in parameters)) throw new Error(`unknown argument "${name}"`)
  }
}

/** Convert one compact value schema into standard JSON Schema. */
function valueSchema(spec) {
  if (spec === null || typeof spec !== 'object') return spec
  if (spec.type === 'object') {
    const properties = {}
    const required = []
    for (const [name, child] of Object.entries(spec.properties ?? {})) {
      properties[name] = valueSchema(child)
      if (child?.required === true) required.push(name)
    }
    return {
      type: 'object',
      ...(spec.additionalProperties === undefined
        ? {}
        : { additionalProperties: spec.additionalProperties }),
      properties,
      ...(required.length === 0 ? {} : { required }),
    }
  }
  if (spec.type === 'array') {
    return {
      type: 'array',
      ...(spec.items === undefined ? {} : { items: valueSchema(spec.items) }),
    }
  }
  return {
    type: spec.type,
    ...(spec.enum === undefined ? {} : { enum: spec.enum }),
  }
}

/**
 * Define one tool without importing the Host's tool package, so a locally
 * linked bundle resolves no Host package at load time.
 */
function defineTool(options) {
  return {
    name: options.name,
    description: options.description,
    parameters: parameterSchema(options.parameters),
    output: { ...options.output, schema: valueSchema(options.output.schema) },
    async execute(args, exec) {
      validateArguments(options.parameters, args)
      return options.execute(args, exec)
    },
  }
}

/** Compact JSON output accepted by the tool registry. */
function jsonOutput(schema) {
  return {
    schema,
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
  }
}

const MEMBER_VIEW = {
  type: 'object',
  additionalProperties: false,
  properties: {
    target: { type: 'string', required: true },
    role: { type: 'string', required: true },
    roleName: { type: 'string', required: true },
    status: { type: 'string', required: true },
    context: { type: 'string', required: true },
    model: { type: 'string', required: true },
    reused: { type: 'boolean', required: true },
    taskSent: { type: 'boolean', required: true },
  },
}

const RULE_VIEW = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    roleId: { type: 'string', required: true },
    text: { type: 'string', required: true },
    polarity: { type: 'string', required: true },
    status: { type: 'string', required: true },
    evidence: { type: 'integer', required: true },
    source: { type: 'string', required: true },
  },
}

const ROLE_VIEW = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    description: { type: 'string', required: true },
    persona: { type: 'string', required: true },
    provider: { type: 'string', required: true },
    model: { type: 'string', required: true },
    reasoningEffort: { type: 'string', required: true },
    toolMode: { type: 'string', required: true },
    tools: { type: 'array', required: true, items: { type: 'string' } },
    skills: { type: 'array', required: true, items: { type: 'string' } },
    color: { type: 'string', required: true },
  },
}

/** Project one role for a model-facing result. */
function roleView(role) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    persona: role.persona,
    provider: role.provider,
    model: role.model,
    reasoningEffort: role.reasoningEffort,
    toolMode: role.toolMode,
    tools: [...role.tools],
    skills: [...role.skills],
    color: role.color,
  }
}

/** Resolve the role a member Agent runs as. */
export function roleIdForAgent(ctx, snapshots, roles, agent) {
  const membership = ctx.agentTeams.tryMembership(agent)
  if (membership === undefined || membership.role !== 'teammate') return undefined
  const snapshot = snapshots.get(membership.root.id, membership.name)
  if (snapshot !== undefined) return snapshot.roleId
  const role = roleForTarget(roles, membership.name)
  return role?.id
}

/**
 * Build every tool definition once per plugin activation.
 *
 * @param options - plugin context, live Config readers, stores, and catalog.
 * @returns the Lead and member tool definitions.
 */
export function createTools({ ctx, config, snapshots, rules, roles, ledger }) {
  /** Read the live role catalog. */
  const catalog = () => mergeRoles(roles.read())

  /** Gate event ledger; absent in some unit tests that never report events. */
  const gateLedger = ledger ?? {
    record: () => {
      throw new Error('gate ledger is unavailable in this deployment')
    },
  }

  /** Resolve the role-management service exposed to tools and other plugins. */
  const rolesApi = () => {
    const api = ctx.get?.('agentTeamRoles')
    if (api === undefined) throw new Error('agentTeamRoles service is unavailable')
    return api
  }

  /** Create or reuse one role-based teammate. */
  const spawnTeamMember = defineTool({
    name: 'spawn_team_member',
    description:
      'Get a teammate for a configured role. If that role already has a healthy member in this Team, reuse it and send the prompt as a task; otherwise create one. Applies the role prompt, model route, tool policy, skills, and learned rules. Only the Team Lead may call this tool.',
    parameters: {
      role: {
        type: 'string',
        required: true,
        description: 'Configured role id from the Lead role catalog.',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'Complete initial task for the teammate, or the task sent to an existing member of that role.',
      },
      name: {
        type: 'string',
        description:
          'Teammate target for a new member. Defaults to the role id; a numeric suffix is added when the name is already used. An existing member of the same role is reused instead.',
      },
      description: {
        type: 'string',
        description: 'Short responsibility shown in the roster. Defaults to the role description.',
      },
      context: {
        type: 'string',
        enum: ['fresh', 'fork'],
        description:
          'fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.',
      },
    },
    output: jsonOutput({
      type: 'object',
      additionalProperties: false,
      properties: { member: MEMBER_VIEW },
    }),
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('spawn_team_member requires a calling Agent')
      const member = await spawnRoleMember({
        ctx,
        config,
        snapshots,
        roles: catalog(),
        caller: exec.agent,
        roleId: args.role,
        prompt: args.prompt,
        name: args.name,
        description: args.description,
        context: args.context,
        signal: exec.signal,
      })
      return { member }
    },
  })

  /** Record a lasting requirement on the Lead's behalf. */
  const recordRoleFeedback = defineTool({
    name: 'record_role_feedback',
    description:
      'Record one lasting requirement about how a role works after the user states it. Use this for "from now on", "always", and "never" requirements; use session scope for a task-local correction. Never record project-specific facts (brand names, domains, schemas, environment, versions, file paths) here — put those in the project memory vault with memory_capture. Only the Team Lead may call this tool.',
    parameters: {
      role: { type: 'string', required: true, description: 'Configured role id.' },
      text: {
        type: 'string',
        required: true,
        description: 'One concise requirement in the user\'s own terms.',
      },
      scope: {
        type: 'string',
        enum: ['permanent', 'candidate', 'session'],
        description:
          'permanent applies immediately and persists; candidate waits for a repeat or review; session lasts only for this Session. Defaults to permanent.',
      },
      polarity: {
        type: 'string',
        enum: ['do', 'dont', 'preference'],
        description: 'Whether the requirement asks for an action, forbids one, or states a preference.',
      },
    },
    output: jsonOutput({
      type: 'object',
      additionalProperties: false,
      properties: {
        rule: RULE_VIEW,
        promoted: { type: 'boolean', required: true },
        scope: { type: 'string', required: true },
      },
    }),
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('record_role_feedback requires a calling Agent')
      requireRole(catalog(), args.role)
      const scope = ['permanent', 'candidate', 'session'].includes(args.scope)
        ? args.scope
        : 'permanent'
      const stored = await rules.add({
        roleId: args.role,
        text: args.text,
        polarity: args.polarity ?? 'preference',
        scope,
        source: 'lead',
        rootSessionId: exec.agent.id,
      })
      return { rule: ruleView(stored.rule), promoted: stored.promoted === true, scope: stored.scope }
    },
  })

  /** List rules for a role. */
  const listRoleRules = defineTool({
    name: 'list_role_rules',
    description: 'List the learned standing rules of one role, including candidate rules awaiting confirmation.',
    parameters: {
      role: { type: 'string', required: true, description: 'Configured role id.' },
    },
    output: jsonOutput({
      type: 'object',
      additionalProperties: false,
      properties: { rules: { type: 'array', required: true, items: RULE_VIEW } },
    }),
    execute(args) {
      return { rules: rules.list(args.role).map(ruleView) }
    },
  })

  /** Retire one rule. */
  const forgetRoleRule = defineTool({
    name: 'forget_role_rule',
    description: 'Retire one learned rule so it stops reaching the role prompt. Only the Team Lead may call this tool.',
    parameters: {
      id: { type: 'string', required: true, description: 'Rule id from list_role_rules.' },
    },
    output: jsonOutput({
      type: 'object',
      additionalProperties: false,
      properties: { removed: { type: 'boolean', required: true } },
    }),
    async execute(args) {
      return { removed: await rules.forget(args.id) }
    },
  })

  const ROLE_FIELD_SPECS = {
    name: { type: 'string', description: 'Display name; defaults to the role id.' },
    description: { type: 'string', description: 'One-line responsibility shown to the Lead.' },
    persona: { type: 'string', description: 'Standing role prompt.' },
    provider: { type: 'string', description: 'LLM provider route; empty inherits the Session route.' },
    model: { type: 'string', description: 'Provider-owned model id; empty inherits the Session model.' },
    reasoningEffort: { type: 'string', description: 'Reasoning effort; empty keeps the adapter default.' },
    toolMode: {
      type: 'string',
      enum: ['all', 'custom'],
      description: 'all, or custom with an explicit allow-list.',
    },
    tools: {
      type: 'array',
      items: { type: 'string' },
      description: 'Allowed tool names when toolMode is custom.',
    },
    skills: {
      type: 'array',
      items: { type: 'string' },
      description: 'Private skill names; empty exposes the whole role skill folder.',
    },
    color: { type: 'string', description: 'Accent color for the roster.' },
  }

  const ROLE_ID_SPEC = {
    type: 'string',
    required: true,
    description: 'Lowercase kebab-case role id; also the default teammate target.',
  }

  /** List every role available for spawning. */
  const listTeamRoles = defineTool({
    name: 'list_team_roles',
    description: 'List the configured Agent Team roles, including their prompt, model route, tool policy, and private skills.',
    parameters: {},
    output: jsonOutput({
      type: 'object',
      additionalProperties: false,
      properties: { roles: { type: 'array', required: true, items: ROLE_VIEW } },
    }),
    execute() {
      return { roles: rolesApi().list().map(roleView) }
    },
  })

  /** Create one role from any Team member. */
  const createTeamRole = defineTool({
    name: 'create_team_role',
    description:
      'Create one reusable Agent Team role. Available to the Lead and to every managed teammate; the role becomes available for future spawns.',
    parameters: { id: ROLE_ID_SPEC, ...ROLE_FIELD_SPECS },
    output: jsonOutput({
      type: 'object',
      additionalProperties: false,
      properties: { role: ROLE_VIEW },
    }),
    async execute(args) {
      const role = await rolesApi().create(args)
      return { role: roleView(role) }
    },
  })

  /** Update one role; Lead only. */
  const updateTeamRole = defineTool({
    name: 'update_team_role',
    description:
      'Update one configured Agent Team role. The role id is immutable. Only the Team Lead may call this tool.',
    parameters: { id: ROLE_ID_SPEC, ...ROLE_FIELD_SPECS },
    output: jsonOutput({
      type: 'object',
      additionalProperties: false,
      properties: { role: ROLE_VIEW },
    }),
    async execute(args) {
      const { id, ...patch } = args
      const role = await rolesApi().update(id, patch)
      return { role: roleView(role) }
    },
  })

  /** Delete one role; Lead only. */
  const deleteTeamRole = defineTool({
    name: 'delete_team_role',
    description:
      'Delete one configured Agent Team role. The built-in general role cannot be deleted. Only the Team Lead may call this tool.',
    parameters: { id: ROLE_ID_SPEC },
    output: jsonOutput({
      type: 'object',
      additionalProperties: false,
      properties: { removed: { type: 'boolean', required: true } },
    }),
    async execute(args) {
      await rolesApi().remove(args.id)
      return { removed: true }
    },
  })

  /** Read the member's own role identity. */
  const ownRole = (agent) => {
    const roleId = roleIdForAgent(ctx, snapshots, catalog(), agent)
    if (roleId === undefined) throw new Error('this member has no managed role')
    return roleId
  }

  /** Record a requirement from the member's own experience. */
  const rememberRoleRule = defineTool({
    name: 'remember_role_rule',
    description:
      'Record one lasting requirement about your own role after the user states it, so future turns and instances follow it. Use permanent only for "from now on", "always", or "never"; use session for a task-local correction; use candidate when unsure. Never record project-specific facts (brand names, domains, schemas, environment, versions, file paths) here — put those in the project memory vault instead.',
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: 'One concise requirement in the user\'s own terms.',
      },
      scope: {
        type: 'string',
        enum: ['permanent', 'candidate', 'session'],
        description: 'How durable the requirement is. Defaults to permanent.',
      },
      polarity: {
        type: 'string',
        enum: ['do', 'dont', 'preference'],
        description: 'Whether the requirement asks for an action, forbids one, or states a preference.',
      },
    },
    output: jsonOutput({
      type: 'object',
      additionalProperties: false,
      properties: {
        rule: RULE_VIEW,
        promoted: { type: 'boolean', required: true },
        scope: { type: 'string', required: true },
      },
    }),
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('remember_role_rule requires a calling Agent')
      const roleId = ownRole(exec.agent)
      const membership = ctx.agentTeams.tryMembership(exec.agent)
      const scope = ['permanent', 'candidate', 'session'].includes(args.scope)
        ? args.scope
        : 'permanent'
      const stored = await rules.add({
        roleId,
        text: args.text,
        polarity: args.polarity ?? 'preference',
        scope,
        source: 'member',
        rootSessionId: membership?.root.id ?? exec.agent.id,
      })
      return { rule: ruleView(stored.rule), promoted: stored.promoted === true, scope: stored.scope }
    },
  })

  /** List the member's own rules. */
  const listMyRules = defineTool({
    name: 'list_my_rules',
    description: 'List the learned standing rules that currently reach your role prompt.',
    parameters: {},
    output: jsonOutput({
      type: 'object',
      additionalProperties: false,
      properties: {
        role: { type: 'string', required: true },
        rules: { type: 'array', required: true, items: RULE_VIEW },
      },
    }),
    execute(_args, exec) {
      if (exec.agent === undefined) throw new Error('list_my_rules requires a calling Agent')
      const roleId = ownRole(exec.agent)
      return { role: roleId, rules: rules.list(roleId).map(ruleView) }
    },
  })

  /** Record a gate event on behalf of the caller's role. */
  const reportGateEvent = defineTool({
    name: 'report_gate_event',
    description:
      'Record a workflow gate event for your role. Call this when a gate demands an event from your role (the rejection message names the event). Events from roles outside a gate\'s byRoles are recorded but satisfy nothing.',
    parameters: {
      event: {
        type: 'string',
        required: true,
        description: 'Kebab-case event name from the rejection message, e.g. checks-passed.',
      },
      note: {
        type: 'string',
        description: 'Optional note stored alongside the record.',
      },
    },
    output: jsonOutput({
      type: 'object',
      additionalProperties: false,
      properties: {
        recorded: { type: 'boolean', required: true },
        event: { type: 'string', required: true },
        role: { type: 'string', required: true },
      },
    }),
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('report_gate_event requires a calling Agent')
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(args.event)) {
        throw new Error('event must be lowercase kebab-case (letters, digits, hyphens; at most 64 characters)')
      }
      const membership = ctx.agentTeams.tryMembership(exec.agent)
      if (membership === undefined) throw new Error('report_gate_event requires a Team member')
      const role = roleIdForAgent(ctx, snapshots, catalog(), exec.agent)
      if (role === undefined) throw new Error('this member has no managed role')
      gateLedger.record(membership.root.id, args.event, role, undefined, args.note)
      return { recorded: true, event: args.event, role }
    },
  })

  return {
    lead: [
      spawnTeamMember,
      recordRoleFeedback,
      listRoleRules,
      forgetRoleRule,
      listTeamRoles,
      createTeamRole,
      updateTeamRole,
      deleteTeamRole,
    ],
    member: [rememberRoleRule, listMyRules, listTeamRoles, createTeamRole, reportGateEvent],
    spawnTeamMember,
    roleIdForAgent: (agent) => roleIdForAgent(ctx, snapshots, catalog(), agent),
    catalog,
  }
}
