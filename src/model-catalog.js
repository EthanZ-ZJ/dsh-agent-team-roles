/**
 * Model catalog route: exposes the host llm service's provider/model catalog
 * to the Settings page, so role model routes are picked from the same models
 * the chat dialog offers.
 *
 *   GET /agent-team-roles/model-catalog
 *     → {
 *         routes: [{
 *           provider, id, name, description?,
 *           reasoningSupported?, efforts?: [{id, name, description?}], defaultEffort?
 *         }],
 *         efforts: [...]   // generic fallback levels only for unknown capability
 *       }
 *
 * Reasoning capability is three-valued per route:
 * - `reasoningSupported: true` — the adapter advertises `efforts`; the client
 *   must offer exactly those levels (and the route's `defaultEffort`).
 * - `reasoningSupported: false` — the adapter explicitly declares no reasoning
 *   support (the normalized resolveModelInfo result has no `reasoning` field,
 *   or an empty effort list). The client must not invent levels for it.
 * - field absent — the catalog could not learn the capability (resolveModelInfo
 *   missing, timed out, or failed); the client keeps its generic fallback list.
 *
 * Per-provider listModels calls are raced against a timeout and a failing
 * provider is skipped instead of failing the whole catalog (providers whose
 * adapters need network may be slow or absent). Results are cached briefly —
 * the settings page re-fetches on every mount.
 */

import { stateDir } from './store.js'

void stateDir

/** Canonical reasoning effort levels, in escalation order. */
export const EFFORT_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/** Per-provider listModels timeout in milliseconds. */
const PROVIDER_TIMEOUT_MS = 8000

/** Per-model resolveModelInfo timeout in milliseconds. */
const MODEL_INFO_TIMEOUT_MS = 8000

/** Catalog cache lifetime in milliseconds. */
const CATALOG_TTL_MS = 60_000

/** Race one promise against a timeout; rejects with a descriptive error. */
function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Read one model's reasoning capability via resolveModelInfo.
 *
 * The host resolves exact model metadata and omits `reasoning` entirely when
 * the adapter declares no reasoning capability (there is no separate
 * "supports" flag); a supported model then carries a non-empty
 * `reasoning.efforts` list. Therefore a successful lookup without a usable
 * reasoning list is an *explicit* "no reasoning support", while a lookup that
 * throws, times out, or is unavailable is *unknown* and must stay undefined so
 * the client can keep its generic fallback.
 *
 * @returns {reasoningSupported:false, efforts:[]} for an explicit no-support
 *   answer, {reasoningSupported:true, efforts, defaultEffort?} for a supported
 *   model, or undefined when the capability could not be learned.
 */
async function modelReasoning(llm, provider, modelId) {
  if (typeof llm.resolveModelInfo !== 'function') return undefined
  let info
  try {
    info = await withTimeout(llm.resolveModelInfo(provider, modelId), MODEL_INFO_TIMEOUT_MS, `resolveModelInfo(${provider}, ${modelId})`)
  } catch {
    return undefined
  }
  if (info === null || typeof info !== 'object') return undefined
  const reasoning = info.reasoning
  // An answered lookup without reasoning metadata is authoritative: this model
  // does not take a reasoning effort. (The host would reject a requested effort
  // for it with UNSUPPORTED_REASONING_EFFORT.)
  if (reasoning === undefined || reasoning === null) return { reasoningSupported: false, efforts: [] }
  if (!Array.isArray(reasoning.efforts)) return { reasoningSupported: false, efforts: [] }
  const efforts = reasoning.efforts
    .filter((effort) => effort !== null && typeof effort === 'object' && typeof effort.id === 'string' && effort.id !== '')
    .map((effort) => ({
      id: effort.id,
      name: typeof effort.name === 'string' && effort.name !== '' ? effort.name : effort.id,
      ...(typeof effort.description === 'string' && effort.description !== '' ? { description: effort.description } : {}),
    }))
  if (efforts.length === 0) return { reasoningSupported: false, efforts: [] }
  return {
    reasoningSupported: true,
    efforts,
    ...(typeof reasoning.defaultEffort === 'string' && reasoning.defaultEffort !== ''
      ? { defaultEffort: reasoning.defaultEffort }
      : {}),
  }
}

/**
 * Build the catalog from an llm service ({listProviders, listModels, resolveModelInfo}).
 * A provider whose listModels rejects is omitted, never fatal; per-model
 * reasoning lookup is best-effort. A route whose capability could not be
 * learned carries no `reasoningSupported` field at all.
 */
export async function buildModelCatalog(llm) {
  const providers = llm.listProviders()
    .map((entry) => (entry !== null && typeof entry === 'object' ? entry.provider ?? entry.id ?? entry.name : entry))
    .filter((name) => typeof name === 'string' && name !== '')
  const settled = await Promise.allSettled(
    providers.map((provider) => withTimeout(llm.listModels(provider), PROVIDER_TIMEOUT_MS, `listModels(${provider})`)),
  )
  const routes = []
  for (let index = 0; index < providers.length; index += 1) {
    const result = settled[index]
    if (result.status !== 'fulfilled' || !Array.isArray(result.value)) continue
    const provider = providers[index]
    for (const model of result.value) {
      if (model === null || typeof model !== 'object' || typeof model.id !== 'string' || model.id === '') continue
      routes.push({
        provider,
        id: model.id,
        name: typeof model.name === 'string' ? model.name : model.id,
        ...(typeof model.description === 'string' && model.description !== '' ? { description: model.description } : {}),
      })
    }
  }
  const reasoning = await Promise.allSettled(
    routes.map((route) => modelReasoning(llm, route.provider, route.id)),
  )
  reasoning.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value !== undefined) Object.assign(routes[index], result.value)
  })
  routes.sort((left, right) => `${left.provider}/${left.id}`.localeCompare(`${right.provider}/${right.id}`))
  return { routes, efforts: EFFORT_LEVELS }
}

/** Prefix route serving the cached catalog. Pass the host llm service in. */
export function modelCatalogRoute(llm) {
  let cache = { at: 0, catalog: null }
  return {
    kind: 'prefix',
    path: '/agent-team-roles/model-catalog',
    resource: async (request) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(JSON.stringify({ error: 'method not allowed' }), {
          status: 405,
          headers: { 'content-type': 'application/json; charset=utf-8', allow: 'GET, HEAD' },
        })
      }
      if (cache.catalog === null || Date.now() - cache.at > CATALOG_TTL_MS) {
        cache = { at: Date.now(), catalog: await buildModelCatalog(llm) }
      }
      return new Response(JSON.stringify(cache.catalog), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    },
  }
}
