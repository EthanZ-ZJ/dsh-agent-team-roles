/**
 * Model-facing tools: role-based spawning on the Lead side, and self-learning
 * rules on both sides.
 *
 * The tools are registered into one exact Agent scope. Their execute functions
 * close over the plugin's live Config readers, so an edited role or a newly
 * learned rule applies to the next call without restarting the plugin.
 */

import {
  DESCRIPTION_LIMIT,
  ROLE_ID,
  findRole,
  mergeRoles,
  readConfig,
  roleForTarget,
  validateRole,
} from './config.js'
import { ruleView } from './rules.js'

/** Convert one compact parameter spec into the JSON Schema the registry wants. */
function parameterSchema(parameters) {
  const properties = {}
  const required = []
  for (const [name, spec] of Object.entries(parameters)) {
    properties[name] = {
      type: spec.type,
      ...(spec.description === undefined ? {} : { description: spec.description }),
      ...(spec.enum === undefined ? {} : { enum: spec.enum }),
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

/** Validate one requested teammate target. */
function validateTarget(name) {
  if (!ROLE_ID.test(name)) {
    throw new Error(`teammate target "${name}" must be lowercase kebab-case, at most 64 characters`)
  }
  if (name === 'lead') throw new Error('teammate target "lead" is reserved for the Team Lead')
}

/** Pick a free target, appending a numeric suffix when the base is taken. */
function freeTarget(base, used) {
  if (!used.has(base)) return base
  for (let index = 2; ; index += 1) {
    const candidate = `${base}-${index}`
    if (!used.has(candidate)) return candidate
  }
}

/** Resolve a role or throw a model-facing list of configured ids. */
function requireRole(roles, id) {
  const role = findRole(roles, id)
  if (role !== undefined) return role
  const available = roles.map((candidate) => candidate.id).join(', ')
  throw new Error(`unknown role "${id}"; configured roles: ${available}`)
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
export function createTools({ ctx, config, snapshots, rules, roles }) {
  /** Read the live role catalog. */
  const catalog = () => mergeRoles(roles.read())

  /** Create one role-based teammate. */
  const spawnTeamMember = defineTool({
    name: 'spawn_team_member',
    description:
      'Create one teammate from a configured role preset. Applies the role prompt, model route, tool policy, skills, and learned rules. Only the Team Lead may call this tool.',
    parameters: {
      role: {
        type: 'string',
        required: true,
        description: 'Configured role id from the Lead role catalog.',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'Complete initial task for the teammate.',
      },
      name: {
        type: 'string',
        description:
          'Teammate target. Defaults to the role id; a numeric suffix is added when it is already used.',
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
      const caller = exec.agent
      const role = requireRole(catalog(), args.role)
      const invalid = validateRole(role)
      if (invalid !== undefined) throw new Error(invalid)

      const used = new Set(ctx.agentTeams.listMembers(caller).map((member) => member.name))
      const requested = typeof args.name === 'string' && args.name.trim() !== ''
        ? args.name.trim().toLowerCase()
        : role.id
      validateTarget(requested)
      const target = freeTarget(requested, used)
      const context = args.context === 'fork' ? 'fork' : 'fresh'
      const description = (typeof args.description === 'string' && args.description.trim() !== ''
        ? args.description.trim()
        : role.description || role.name
      ).slice(0, DESCRIPTION_LIMIT)

      const frozen = { ...role }
      await snapshots.record({
        rootSessionId: caller.id,
        name: target,
        roleId: role.id,
        frozen,
      })

      let result
      try {
        result = await ctx.agentTeams.spawnTeammate(caller, {
          name: target,
          description,
          prompt: [{ type: 'text', text: args.prompt }],
          context,
          provider: readConfig(config, `${context}Provider`) ?? (context === 'fork' ? 'fork' : 'spawn'),
          signal: exec.signal,
        })
      } catch (error) {
        await snapshots.remove(caller.id, target).catch(() => undefined)
        throw error
      }

      return {
        member: {
          target: result.member.name,
          role: role.id,
          roleName: role.name,
          status: result.member.status,
          context,
          model: frozen.provider === '' ? 'session' : `${frozen.provider}/${frozen.model}`,
        },
      }
    },
  })

  /** Record a lasting requirement on the Lead's behalf. */
  const recordRoleFeedback = defineTool({
    name: 'record_role_feedback',
    description:
      'Record one lasting requirement for a role after the user states it. Use this for "from now on", "always", and "never" requirements; use session scope for a task-local correction. Only the Team Lead may call this tool.',
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
      'Record one lasting requirement about your own role after the user states it, so future turns and instances follow it. Use permanent only for "from now on", "always", or "never"; use session for a task-local correction; use candidate when unsure.',
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

  return {
    lead: [spawnTeamMember, recordRoleFeedback, listRoleRules, forgetRoleRule],
    member: [rememberRoleRule, listMyRules],
    spawnTeamMember,
    roleIdForAgent: (agent) => roleIdForAgent(ctx, snapshots, catalog(), agent),
    catalog,
  }
}
