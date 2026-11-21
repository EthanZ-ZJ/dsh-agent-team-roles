/**
 * Shared JSON body reader for host route handlers.
 *
 * A `handler` route receives the Node request stream, while a `resource` route
 * receives a web `Request`. Supporting both keeps the call sites from guessing
 * and, more importantly, stops a POST body from being silently ignored.
 */

const DEFAULT_LIMIT = 8192

/** Read one bounded JSON body; throws on oversize or malformed input. */
export async function readJsonBody(req, limit = DEFAULT_LIMIT) {
  if (typeof req?.json === 'function') return await req.json()
  if (typeof req?.text === 'function') return JSON.parse((await req.text()) || '{}')
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}
