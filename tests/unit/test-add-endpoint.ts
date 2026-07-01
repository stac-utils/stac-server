import test from 'ava'
import type { Request, Response } from 'express'
import addEndpoint from '../../src/lambdas/api/middleware/add-endpoint.js'

type Headers = Record<string, string | undefined>

/**
 * Build a minimal Express-like Request. `headers` are matched case-insensitively
 * to mirror `req.get()`. `protocol`, `event`, and env are all overridable so each
 * fallback branch of `determineEndpoint` can be exercised in isolation.
 */
const mockReq = (opts: {
  headers?: Headers
  protocol?: string
  event?: Request['event']
} = {}): Request => {
  const headers = opts.headers ?? {}
  return {
    protocol: opts.protocol,
    event: opts.event,
    get(name: string) {
      const key = Object.keys(headers).find(
        (h) => h.toLowerCase() === name.toLowerCase()
      )
      return key ? headers[key] : undefined
    }
  } as unknown as Request
}

/** Run the middleware and return the endpoint it assigned to the request. */
const runEndpoint = (req: Request): string => {
  let called = false
  addEndpoint(req, {} as Response, () => { called = true })
  if (!called) throw new Error('next() was not called')
  return req.endpoint
}

// Isolate each test from ambient env (the pre-commit runs may set these).
test.beforeEach(() => {
  delete process.env['STAC_API_URL']
  delete process.env['STAC_API_ROOTPATH']
})

test.serial('stac-endpoint header takes precedence over everything', (t) => {
  process.env['STAC_API_URL'] = 'https://from-env.example.com'
  const req = mockReq({ headers: { 'stac-endpoint': 'https://from-header.example.com' } })
  t.is(runEndpoint(req), 'https://from-header.example.com')
})

test.serial('legacy X-STAC-Endpoint header is honored', (t) => {
  const req = mockReq({ headers: { 'x-stac-endpoint': 'https://legacy.example.com' } })
  t.is(runEndpoint(req), 'https://legacy.example.com')
})

test.serial('STAC_API_URL env is used when no endpoint header is set', (t) => {
  process.env['STAC_API_URL'] = 'https://from-env.example.com'
  const req = mockReq({ headers: { Host: 'ignored.example.com' }, protocol: 'http' })
  t.is(runEndpoint(req), 'https://from-env.example.com')
})

test.serial('X-Forwarded-Proto and X-Forwarded-Host are used together', (t) => {
  const req = mockReq({
    headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'proxy.example.com' }
  })
  t.is(runEndpoint(req), 'https://proxy.example.com')
})

test.serial('STAC_API_ROOTPATH is appended to the forwarded-host endpoint', (t) => {
  process.env['STAC_API_ROOTPATH'] = '/stac/v1'
  const req = mockReq({
    headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'proxy.example.com' }
  })
  t.is(runEndpoint(req), 'https://proxy.example.com/stac/v1')
})

test.serial('falls back to req.protocol and Host when nothing is forwarded', (t) => {
  const req = mockReq({ headers: { Host: 'direct.example.com' }, protocol: 'http' })
  t.is(runEndpoint(req), 'http://direct.example.com')
})

test.serial('defaults to https://localhost when protocol and Host are absent (#917)', (t) => {
  // The API Gateway case: no configured endpoint, no forwarded headers, and
  // Express reports no usable protocol/host. Must never yield `undefined://...`.
  const req = mockReq({})
  const endpoint = runEndpoint(req)
  t.is(endpoint, 'https://localhost')
  t.false(endpoint.startsWith('undefined://'))
})

test.serial('appends the API Gateway stage when present and no forwarded host', (t) => {
  const req = mockReq({
    headers: { Host: 'abc123.execute-api.us-west-2.amazonaws.com' },
    protocol: 'https',
    event: { requestContext: { stage: 'prod' } } as Request['event']
  })
  t.is(runEndpoint(req), 'https://abc123.execute-api.us-west-2.amazonaws.com/prod')
})

test.serial('a forwarded host suppresses the stage segment', (t) => {
  // With X-Forwarded-Host present the proxy owns the public path, so the raw
  // Lambda stage must not be appended.
  const req = mockReq({
    headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'proxy.example.com' },
    event: { requestContext: { stage: 'prod' } } as Request['event']
  })
  t.is(runEndpoint(req), 'https://proxy.example.com')
})
