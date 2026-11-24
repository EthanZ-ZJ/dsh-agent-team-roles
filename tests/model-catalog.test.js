import test from 'node:test'
import assert from 'node:assert/strict'
import { buildModelCatalog, modelCatalogRoute, EFFORT_LEVELS } from '../src/model-catalog.js'

function fakeLlm(providers, modelsByProvider) {
  return {
    listProviders: () => providers,
    listModels: async (provider) => {
      const models = modelsByProvider[provider]
      if (models === undefined) throw new Error(`unknown provider ${provider}`)
      return models
    },
  }
}

test('buildModelCatalog flattens provider catalogs with sorted combined routes', async () => {
  const llm = fakeLlm(
    [{ provider: 'zai' }, { provider: 'deepseek-account' }],
    {
      zai: [{ id: 'glm-5.3', name: 'GLM 5.3', description: 'flagship' }, { id: 'glm-5.3-flash', name: 'Flash' }],
      'deepseek-account': [{ id: 'deepseek-flash', name: 'DeepSeek Flash' }],
    },
  )
  const catalog = await buildModelCatalog(llm)
  assert.deepEqual(catalog.efforts, EFFORT_LEVELS)
  assert.deepEqual(catalog.routes.map((route) => `${route.provider}/${route.id}`), [
    'deepseek-account/deepseek-flash',
    'zai/glm-5.3',
    'zai/glm-5.3-flash',
  ])
  assert.equal(catalog.routes[1].description, 'flagship')
})

test('a failing provider is skipped, never fatal', async () => {
  const llm = fakeLlm(
    [{ provider: 'broken' }, { provider: 'zai' }],
    { zai: [{ id: 'glm-5.3', name: 'GLM 5.3' }] },
  )
  const catalog = await buildModelCatalog(llm)
  assert.deepEqual(catalog.routes.map((route) => route.provider), ['zai'])
})

test('modelCatalogRoute serves cached JSON and rejects non-GET', async (t) => {
  let calls = 0
  const llm = {
    listProviders: () => [{ provider: 'zai' }],
    listModels: async () => {
      calls += 1
      return [{ id: 'glm-5.3', name: 'GLM 5.3' }]
    },
  }
  const route = modelCatalogRoute(llm)
  assert.equal(route.path, '/agent-team-roles/model-catalog')

  const first = await route.resource(new Request('http://localhost/agent-team-roles/model-catalog'))
  const body = await first.json()
  assert.equal(first.status, 200)
  assert.equal(body.routes.length, 1)
  assert.deepEqual(body.efforts, EFFORT_LEVELS)

  const second = await route.resource(new Request('http://localhost/agent-team-roles/model-catalog'))
  await second.json()
  assert.equal(calls, 1, 'second read must be served from cache')

  const rejected = await route.resource(new Request('http://localhost/agent-team-roles/model-catalog', { method: 'POST' }))
  assert.equal(rejected.status, 405)
})

test('model reasoning metadata rides along per route', async () => {
  const llm = {
    listProviders: () => [{ provider: 'zai' }],
    listModels: async () => [{ id: 'glm-5.2', name: 'GLM-5.2' }],
    resolveModelInfo: async (provider, model) => ({
      provider,
      id: model,
      name: 'GLM-5.2',
      reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }], defaultEffort: 'high' },
    }),
  }
  const catalog = await buildModelCatalog(llm)
  const route = catalog.routes.find((entry) => entry.id === 'glm-5.2')
  assert.equal(route.reasoningSupported, true)
  assert.deepEqual(route.efforts.map((effort) => effort.id), ['off', 'high'])
  assert.deepEqual(route.efforts.map((effort) => effort.name), ['Off', 'High'])
  assert.equal(route.defaultEffort, 'high')
})

test('an answered lookup without reasoning metadata is an explicit no-support answer', async () => {
  const llm = {
    listProviders: () => [{ provider: 'opencode-go-api' }],
    listModels: async () => [{ id: 'hy4-flash-free', name: 'Hy4 Flash Free' }],
    // The host's resolveModelInfo omits `reasoning` when the adapter declares no
    // reasoning capability; this is the real hy4-flash-free shape.
    resolveModelInfo: async () => ({
      provider: 'opencode-go-api',
      id: 'hy4-flash-free',
      name: 'Hy4 Flash Free',
      context: { contextWindow: 1048576 },
    }),
  }
  const catalog = await buildModelCatalog(llm)
  const route = catalog.routes.find((entry) => entry.id === 'hy4-flash-free')
  assert.equal(route.reasoningSupported, false, 'the route must say reasoning is unsupported')
  assert.deepEqual(route.efforts, [])
  assert.equal(route.defaultEffort, undefined)
})

test('an answered lookup with an empty effort list is also an explicit no-support answer', async () => {
  const llm = {
    listProviders: () => [{ provider: 'zai' }],
    listModels: async () => [{ id: 'glm-5.2', name: 'GLM-5.2' }],
    resolveModelInfo: async () => ({
      provider: 'zai',
      id: 'glm-5.2',
      name: 'GLM-5.2',
      reasoning: { efforts: [] },
    }),
  }
  const catalog = await buildModelCatalog(llm)
  const route = catalog.routes.find((entry) => entry.id === 'glm-5.2')
  assert.equal(route.reasoningSupported, false)
  assert.deepEqual(route.efforts, [])
})

test('a failed reasoning lookup is unknown, not an unsupported answer', async () => {
  const llm = {
    listProviders: () => [{ provider: 'zai' }],
    listModels: async () => [{ id: 'glm-5.2', name: 'GLM-5.2' }, { id: 'glm-5.3', name: 'GLM-5.3' }],
    resolveModelInfo: async (provider, model) => {
      if (model === 'glm-5.2') throw new Error('no metadata')
      return { provider, id: model, name: 'GLM-5.3', reasoning: { efforts: [{ id: 'high', name: 'High' }] } }
    },
  }
  const catalog = await buildModelCatalog(llm)
  assert.deepEqual(catalog.routes.map((route) => route.id), ['glm-5.2', 'glm-5.3'], 'a failure never drops a route')
  const unknown = catalog.routes[0]
  assert.equal('reasoningSupported' in unknown, false, 'an unknown capability must stay absent')
  assert.equal(unknown.efforts, undefined)
  assert.equal(unknown.defaultEffort, undefined)
  assert.equal(catalog.routes[1].reasoningSupported, true)
  assert.equal(catalog.routes[1].efforts[0].id, 'high')
})

test('a catalog without resolveModelInfo also stays unknown', async () => {
  const llm = {
    listProviders: () => [{ provider: 'zai' }],
    listModels: async () => [{ id: 'glm-5.2', name: 'GLM-5.2' }],
  }
  const catalog = await buildModelCatalog(llm)
  const route = catalog.routes.find((entry) => entry.id === 'glm-5.2')
  assert.equal('reasoningSupported' in route, false)
  assert.equal(route.efforts, undefined)
})
