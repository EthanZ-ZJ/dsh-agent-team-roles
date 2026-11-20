/**
 * Model catalog route: exposes the host llm service's provider/model catalog
 * to the Settings page, so role model routes are picked from the same models
 * the chat dialog offers.
 *
 *   GET /agent-team-roles/model-catalog
 *     → { routes: [{provider, id, name, description?}], efforts: [...] }
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
 * Build the catalog from an llm service ({listProviders, listModels}).
 * A provider whose listModels rejects is omitted, never fatal.
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
