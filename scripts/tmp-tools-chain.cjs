const fs = require('fs')
const path = 'src/tools.js'
let s = fs.readFileSync(path, 'utf8')
const must = (needle, label) => {
  if (!s.includes(needle)) { console.log('MISSING ' + label); process.exit(1) }
}
must("import { findRole, mergeRoles, roleForTarget } from './config.js'", 'config import')

// 1. Role view exposes the fallback chain.
s = s.replace(
  "    fallbackReasoningEffort: { type: 'string', required: true },",
  "    fallbackReasoningEffort: { type: 'string', required: true },\n    fallbacks: {\n      type: 'array',\n      required: true,\n      items: {\n        type: 'object',\n        additionalProperties: false,\n        properties: {\n          provider: { type: 'string', required: true },\n          model: { type: 'string', required: true },\n          reasoningEffort: { type: 'string', required: true },\n        },\n      },\n    },",
)
s = s.replace(
  "    fallbackReasoningEffort: role.fallbackReasoningEffort ?? '',",
  "    fallbackReasoningEffort: role.fallbackReasoningEffort ?? '',\n    fallbacks: roleFallbacks(role),",
)

// 2. Editable field spec.
s = s.replace(
  "    fallbackReasoningEffort: { type: 'string', description: 'Reasoning effort for the fallback model; empty uses that model’s default.' },",
  "    fallbackReasoningEffort: { type: 'string', description: 'Reasoning effort for the legacy single fallback model; empty uses that model’s default.' },\n    fallbacks: {\n      type: 'array',\n      items: {\n        type: 'object',\n        additionalProperties: false,\n        properties: {\n          provider: { type: 'string', required: true },\n          model: { type: 'string', required: true },\n          reasoningEffort: { type: 'string' },\n        },\n      },\n      description: 'Ordered fallback routes tried in order (at most 8); empty falls back to the legacy fallbackProvider/fallbackModel pair.',\n    },",
)

// 3. switch_member_model: optional chain index.
s = s.replace(
  "        enum: ['fallback', 'primary'],\n        description: 'fallback = the role\\'s fallback route; primary = the role\\'s main route.',",
  "        enum: ['fallback', 'primary'],\n        description: 'fallback = a route from the ordered fallback chain; primary = the role\\'s main route.',\n      },\n      index: {\n        type: 'integer',\n        description: 'Zero-based position in the fallback chain when route is fallback; defaults to 0 (the first fallback).',",
)

const oldRoutePick = `      const route = args.route === 'fallback'
        ? { label: 'fallback', provider: role.fallbackProvider ?? '', model: role.fallbackModel ?? '', reasoningEffort: role.fallbackReasoningEffort }
        : { label: 'primary', provider: role.provider, model: role.model, reasoningEffort: role.reasoningEffort }
      if (route.provider === '' || route.model === '') {
        throw new Error(args.route === 'fallback'
          ? \`role "\${role.id}" has no fallback model configured; set fallbackProvider and fallbackModel first\`
          : \`role "\${role.id}" has no explicit primary model (it inherits the Session route); configure provider and model first\`)
      }`
const newRoutePick = `      const chain = roleFallbacks(role)
      const index = Number.isInteger(args.index) ? args.index : 0
      if (args.route === 'fallback' && (index < 0 || index >= chain.length)) {
        throw new Error(chain.length === 0
          ? \`role "\${role.id}" has no fallback model configured; configure fallback routes first\`
          : \`role "\${role.id}" has \${chain.length} fallback route(s); index \${index} is out of range\`)
      }
      const route = args.route === 'fallback'
        ? { label: 'fallback', fallbackIndex: index, ...chain[index] }
        : { label: 'primary', provider: role.provider, model: role.model, reasoningEffort: role.reasoningEffort }
      if (route.provider === '' || route.model === '') {
        throw new Error(\`role "\${role.id}" has no explicit primary model (it inherits the Session route); configure provider and model first\`)
      }`
must(oldRoutePick, 'route pick')
s = s.replace(oldRoutePick, newRoutePick)

s = s.replace(
  "      if (overrides !== undefined) overrides.set(handleKey, { ...routeValue, route: route.label, via: 'lead', at: Date.now() })",
  "      if (overrides !== undefined) {\n        overrides.set(handleKey, {\n          ...routeValue,\n          route: route.label,\n          ...(route.fallbackIndex === undefined ? {} : { fallbackIndex: route.fallbackIndex }),\n          via: 'lead',\n          at: Date.now(),\n        })\n      }",
)

s = s.replace(
  "      const text = typeof args.message === 'string' && args.message.trim() !== ''\n        ? args.message.trim()\n        : \`Your model route is now \${route.provider}/\${route.model}. Continue the task you were working on from where you stopped; do not restart it.\`",
  "      const routeName = route.fallbackIndex === undefined ? route.label : \`\${route.label} #\${route.fallbackIndex + 1}\`\n      const text = typeof args.message === 'string' && args.message.trim() !== ''\n        ? args.message.trim()\n        : \`Your model route is now \${routeName} (\${route.provider}/\${route.model}). Continue the task you were working on from where you stopped; do not restart it.\`",
)

s = s.replace(
  "        messageSent: true,\n        applied,",
  "        messageSent: true,\n        applied,\n        ...(route.fallbackIndex === undefined ? {} : { fallbackIndex: route.fallbackIndex }),",
)
fs.writeFileSync(path, s)
console.log('tools updated')
