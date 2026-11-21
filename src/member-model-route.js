/**
 * Manual per-member model switch route.
 *
 * The Team panel shows which model each teammate is on; switching one by hand
 * must not require a Lead tool call. The host owns the selection (a live Agent
 * is re-selected in place, a dormant member gets a pending override), so the
 * route only validates the request and delegates.
 */

import { readJsonBody } from './request-body.js'

/** Same grammar as teammate targets. */
const MEMBER = /^[a-z][a-z0-9-]{0,63}$/

/** JSON response on a handler-owned ServerResponse. */
function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/**
 * Validate one switch request.
 *
 * @returns a normalized request, or `{ error }` for a 400 response.
 */
export function parseMemberModelRequest(body) {
  if (body === null || typeof body !== 'object') return { error: 'expected a JSON object' }
  const { rootId, member, provider, model, reasoningEffort, clear } = body
  if (typeof rootId !== 'string' || rootId.trim() === '') return { error: 'rootId is required' }
  if (typeof member !== 'string' || !MEMBER.test(member)) return { error: 'member must be lowercase kebab-case' }
  if (clear === true) return { rootId: rootId.trim(), member, clear: true }
  if (typeof provider !== 'string' || provider.trim() === '') return { error: 'provider is required' }
  if (typeof model !== 'string' || model.trim() === '') return { error: 'model is required' }
  if (reasoningEffort !== undefined && reasoningEffort !== null && typeof reasoningEffort !== 'string') {
    return { error: 'reasoningEffort must be a string' }
  }
  return {
    rootId: rootId.trim(),
    member,
    provider: provider.trim(),
    model: model.trim(),
    reasoningEffort: typeof reasoningEffort === 'string' ? reasoningEffort.trim() : '',
  }
}

/**
 * Build the POST route.
 *
 * @param switchModel - applies the selection and returns the member view; may
 *   throw with a model-facing message (unknown member, rejected selection).
 */
export function memberModelRoute(switchModel) {
  return {
    kind: 'exact',
    path: '/agent-team-roles/member-model',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        return sendJson(res, 405, { error: 'method not allowed' })
      }
      let body
      try {
        body = await readJsonBody(req)
      } catch {
        return sendJson(res, 400, { error: 'invalid JSON body' })
      }
      const request = parseMemberModelRequest(body)
      if (request.error !== undefined) return sendJson(res, 400, { error: request.error })
      try {
        return sendJson(res, 200, await switchModel(request))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const status = /unknown member|no such member/i.test(message) ? 404 : 409
        return sendJson(res, status, { error: message })
      }
    },
  }
}
