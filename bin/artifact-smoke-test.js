// Smoke-test the built lambda ZIP artifacts by invoking their bundled handlers
// with canned Lambda events. Catches bundle-only failures that tests running
// against src/ cannot see (webpack module interop, ZIP layout).
//
// Both packaging styles are tested: the per-lambda ZIPs (dist/api/api.zip,
// dist/ingest/ingest.zip from npm run build) and the combined lambda-dist ZIP
// (dist/lambda-dist/lambda-dist.zip from npm run build-lambda-dist).
//
// Static routes (/, /conformance, /api, /api.html) are always checked. When a
// local OpenSearch is reachable at 127.0.0.1:9200 (the database client's
// no-config default, as in the system tests), a test collection and item are
// ingested through the bundled ingest handler and all read endpoints are
// checked through the bundled API handler. Set SMOKE_TEST_REQUIRE_DB=true to
// fail instead of skipping when OpenSearch is unreachable (used in CI, where
// the service is expected).
//
// Usage: node bin/artifact-smoke-test.js
// (--invoke-api and --invoke-ingest are internal per-bundle child modes; each
// bundle needs its own process because LAMBDA_TASK_ROOT is captured at module
// load.)

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const OPENSEARCH = '127.0.0.1:9200'

// OPENSEARCH_HOST and ES_HOST are cleared so the bundled database client uses
// its plain-HTTP local default; a set host would route it through AWS SigV4
// auth.
const CHILD_ENV = {
  AWS_REGION: 'us-east-1',
  ENABLE_TRANSACTIONS_EXTENSION: 'false',
  OPENSEARCH_HOST: '',
  ES_HOST: '',
}

const COLLECTION = {
  type: 'Collection',
  id: 'artifact-smoke-test',
  stac_version: '1.1.0',
  description: 'Throwaway collection ingested by bin/artifact-smoke-test.js',
  license: 'proprietary',
  extent: {
    spatial: { bbox: [[-105.3, 39.9, -104.8, 40.1]] },
    temporal: { interval: [['2024-06-01T00:00:00Z', '2024-06-30T23:59:59Z']] },
  },
  links: [],
}

const ITEM = {
  type: 'Feature',
  stac_version: '1.1.0',
  id: 'artifact-smoke-test-item-1',
  collection: 'artifact-smoke-test',
  geometry: {
    type: 'Polygon',
    coordinates: [[[-105.1, 39.95], [-105.0, 39.95], [-105.0, 40.05],
      [-105.1, 40.05], [-105.1, 39.95]]],
  },
  bbox: [-105.1, 39.95, -105.0, 40.05],
  properties: { datetime: '2024-06-10T17:00:00Z' },
  assets: {},
  links: [],
}

const STATIC_CHECKS = [
  { method: 'GET', path: '/', mustInclude: '"stac_version"' },
  { method: 'GET', path: '/conformance', mustInclude: 'conformsTo' },
  { method: 'GET', path: '/api', mustInclude: 'openapi' },
  { method: 'GET', path: '/api.html', mustInclude: 'redoc' },
]

const DB_CHECKS = [
  { method: 'GET', path: '/healthcheck', mustInclude: '"status":"ok"' },
  { method: 'GET', path: '/queryables', mustInclude: 'schema' },
  { method: 'GET', path: '/search', mustInclude: 'FeatureCollection' },
  {
    method: 'POST',
    path: '/search',
    body: '{"collections":["artifact-smoke-test"]}',
    mustInclude: 'artifact-smoke-test-item-1',
  },
  { method: 'GET', path: '/aggregations', mustInclude: 'aggregations' },
  { method: 'GET', path: '/collections', mustInclude: '"artifact-smoke-test"' },
  { method: 'GET', path: '/collections/artifact-smoke-test', mustInclude: '"artifact-smoke-test"' },
  { method: 'GET', path: '/collections/artifact-smoke-test/queryables', mustInclude: 'schema' },
  {
    method: 'GET',
    path: '/collections/artifact-smoke-test/aggregations',
    mustInclude: 'aggregations',
  },
  {
    method: 'GET',
    path: '/collections/artifact-smoke-test/items',
    mustInclude: 'FeatureCollection',
  },
  {
    method: 'GET',
    path: '/collections/artifact-smoke-test/items/artifact-smoke-test-item-1',
    mustInclude: 'artifact-smoke-test-item-1',
  },
]

const apiGatewayEvent = ({ method, path, body }) => ({
  resource: '/{proxy+}',
  path,
  httpMethod: method,
  headers: {
    Host: 'example.com',
    'X-Forwarded-Proto': 'https',
    'Content-Type': 'application/json',
  },
  multiValueHeaders: { Host: ['example.com'] },
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  pathParameters: path === '/' ? null : { proxy: path.slice(1) },
  stageVariables: null,
  body: body || null,
  isBase64Encoded: false,
  requestContext: {
    accountId: '123456789012',
    apiId: 'smoke-test',
    authorizer: null,
    protocol: 'HTTP/1.1',
    httpMethod: method,
    identity: {
      accessKey: null,
      accountId: null,
      caller: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      sourceIp: '127.0.0.1',
      user: null,
      userAgent: 'artifact-smoke-test',
      userArn: null,
    },
    path,
    stage: 'smoke-test',
    requestId: 'artifact-smoke-test',
    requestTimeEpoch: 0,
    resourceId: 'smoke-test',
    resourcePath: '/{proxy+}',
  },
})

const sqsEvent = (record) => ({
  Records: [{ body: JSON.stringify(record) }],
})

const loadHandler = async (handlerDir) => {
  const require = createRequire(import.meta.url)
  // The api bundle top-level-awaits its app creation, so module.exports is a
  // promise; await unwraps it (and passes plain objects through).
  // eslint-disable-next-line import/no-dynamic-require
  const { handler } = await require(join(handlerDir, 'index.js'))
  return handler
}

const lambdaContext = { getRemainingTimeInMillis: () => 30000 }

const invokeApi = async (taskRoot, handlerDir, withDb) => {
  process.env['LAMBDA_TASK_ROOT'] = taskRoot
  const handler = await loadHandler(handlerDir)

  const checks = withDb ? [...STATIC_CHECKS, ...DB_CHECKS] : STATIC_CHECKS

  let failures = 0
  for (const check of checks) {
    // eslint-disable-next-line no-await-in-loop
    const result = await handler(apiGatewayEvent(check), lambdaContext)
    const body = result.isBase64Encoded
      ? Buffer.from(result.body, 'base64').toString('utf8')
      : String(result.body)

    const problems = []
    if (result.statusCode !== 200) problems.push(`status ${result.statusCode}`)
    if (!body.includes(check.mustInclude)) problems.push(`body missing "${check.mustInclude}"`)

    if (problems.length) {
      failures += 1
      console.error(`  FAIL ${check.method} ${check.path}: ${problems.join(', ')}`)
    } else {
      console.log(`  ok   ${check.method} ${check.path}`)
    }
  }
  return failures
}

const invokeIngest = async (handlerDir) => {
  const handler = await loadHandler(handlerDir)

  await handler({ create_indices: true }, lambdaContext)
  await handler(sqsEvent(COLLECTION), lambdaContext)
  await handler(sqsEvent(ITEM), lambdaContext)
  console.log('  ok   ingest (create indices, collection, item)')
}

const opensearchReachable = async () => {
  try {
    const response = await fetch(`http://${OPENSEARCH}/`, { signal: AbortSignal.timeout(3000) })
    return response.ok
  } catch {
    return false
  }
}

const refreshIndices = async () => {
  await fetch(`http://${OPENSEARCH}/_refresh`, { method: 'POST' })
}

const unzip = (zip) => {
  const dir = mkdtempSync(join(tmpdir(), 'stac-server-artifact-'))
  execFileSync('unzip', ['-q', zip, '-d', dir])
  return dir
}

const runChild = (self, args) => {
  const child = spawnSync(process.execPath, [self, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...CHILD_ENV },
  })
  return child.status === 0
}

const runParent = async () => {
  const self = fileURLToPath(import.meta.url)

  const withDb = await opensearchReachable()
  if (!withDb) {
    const message = `OpenSearch is unreachable at ${OPENSEARCH}`
    if (process.env['SMOKE_TEST_REQUIRE_DB'] === 'true') {
      console.error(`FAIL ${message} and SMOKE_TEST_REQUIRE_DB is set`)
      process.exit(1)
    }
    console.log(`${message} — checking static routes only`)
  }

  const styles = [
    {
      apiZip: 'dist/api/api.zip',
      apiSubdir: '.',
      ingestZip: 'dist/ingest/ingest.zip',
      ingestSubdir: '.',
    },
    {
      apiZip: 'dist/lambda-dist/lambda-dist.zip',
      apiSubdir: 'api',
      ingestZip: 'dist/lambda-dist/lambda-dist.zip',
      ingestSubdir: 'ingest',
    },
  ]

  let failed = false
  for (const style of styles) {
    const missing = [style.apiZip, style.ingestZip].filter((zip) => !existsSync(zip))
    if (missing.length) {
      console.error(`FAIL ${missing.join(', ')} not found (run the build first)`)
      failed = true
    } else {
      const apiDir = unzip(style.apiZip)
      const ingestDir = style.ingestZip === style.apiZip ? apiDir : unzip(style.ingestZip)
      try {
        console.log(`${style.apiZip}:`)
        if (withDb) {
          const ingested = runChild(self, ['--invoke-ingest', join(ingestDir, style.ingestSubdir)])
          if (ingested) {
            // eslint-disable-next-line no-await-in-loop
            await refreshIndices()
          } else {
            failed = true
          }
        }
        const dbFlag = withDb ? '1' : '0'
        const apiArgs = ['--invoke-api', apiDir, join(apiDir, style.apiSubdir), dbFlag]
        if (!runChild(self, apiArgs)) failed = true
      } finally {
        rmSync(apiDir, { recursive: true, force: true })
        if (ingestDir !== apiDir) rmSync(ingestDir, { recursive: true, force: true })
      }
    }
  }

  process.exit(failed ? 1 : 0)
}

const mode = process.argv[2]
if (mode === '--invoke-api') {
  const [, , , taskRoot, handlerDir, dbFlag] = process.argv
  const failures = await invokeApi(taskRoot, handlerDir, dbFlag === '1')
  process.exit(failures === 0 ? 0 : 1)
} else if (mode === '--invoke-ingest') {
  const [, , , handlerDir] = process.argv
  await invokeIngest(handlerDir)
  process.exit(0)
} else {
  await runParent()
}
