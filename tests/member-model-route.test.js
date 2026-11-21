import assert from 'node:assert/strict'
import test from 'node:test'
import { memberModelRoute, parseMemberModelRequest } from '../src/member-model-route.js'

function responseSink() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value },
    end(payload) { this.body = payload },
    get json() { return JSON.parse(this.body) },
  }
}

const post = (body) => new Request('http://localhost/agent-team-roles/member-model', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
})

test('a member model request validates required fields', () => {
  assert.equal(parseMemberModelRequest(null).error, 'expected a JSON object')
  assert.equal(parseMemberModelRequest({}).error, 'rootId is required')
  assert.equal(parseMemberModelRequest({ rootId: 'r' }).error, 'member must be lowercase kebab-case')
  assert.equal(parseMemberModelRequest({ rootId: 'r', member: 'dev' }).error, 'provider is required')
  assert.equal(parseMemberModelRequest({ rootId: 'r', member: 'dev', provider: 'zai' }).error, 'model is required')
  assert.deepEqual(
    parseMemberModelRequest({ rootId: ' r ', member: 'dev', provider: ' zai ', model: ' glm ', reasoningEffort: ' high ' }),
    { rootId: 'r', member: 'dev', provider: 'zai', model: 'glm', reasoningEffort: 'high' },
  )
  assert.equal(parseMemberModelRequest({ rootId: 'r', member: 'dev', provider: 'zai', model: 'm', reasoningEffort: 3 }).error,
    'reasoningEffort must be a string')
})

test('the route switches the model, rejects other methods, and maps failures', async () => {
  const calls = []
  const route = memberModelRoute(async (request) => {
    calls.push(request)
    if (request.member === 'ghost') throw new Error('unknown member "ghost" in this Team')
    return { ...request, roleId: 'dev', live: true }
  })
  assert.equal(route.kind, 'exact')
  assert.equal(route.path, '/agent-team-roles/member-model')

  const wrongMethod = responseSink()
  await route.handler(new Request('http://localhost/agent-team-roles/member-model'), wrongMethod)
  assert.equal(wrongMethod.statusCode, 405)

  const invalid = responseSink()
  await route.handler(post({ rootId: 'r' }), invalid)
  assert.equal(invalid.statusCode, 400)

  const broken = responseSink()
  await route.handler(post('{not json'), broken)
  assert.equal(broken.statusCode, 400)

  const ok = responseSink()
  await route.handler(post({ rootId: 'root', member: 'dev', provider: 'zai', model: 'glm', reasoningEffort: 'high' }), ok)
  assert.equal(ok.statusCode, 200)
  assert.deepEqual(ok.json, { rootId: 'root', member: 'dev', provider: 'zai', model: 'glm', reasoningEffort: 'high', roleId: 'dev', live: true })
  assert.deepEqual(calls[0], { rootId: 'root', member: 'dev', provider: 'zai', model: 'glm', reasoningEffort: 'high' })

  const missing = responseSink()
  await route.handler(post({ rootId: 'root', member: 'ghost', provider: 'zai', model: 'glm' }), missing)
  assert.equal(missing.statusCode, 404)

  const rejected = responseSink()
  const rejecting = memberModelRoute(async () => { throw new Error('cannot select zai/glm for "dev": no such model') })
  await rejecting.handler(post({ rootId: 'root', member: 'dev', provider: 'zai', model: 'glm' }), rejected)
  assert.equal(rejected.statusCode, 409)
  assert.match(rejected.json.error, /cannot select/)
})
