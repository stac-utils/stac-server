// Smoke-test the built lambda ZIP artifacts by invoking their bundled API
// handlers with a canned API Gateway event. Catches bundle-only failures that
// tests running against src/ cannot see (webpack module interop, ZIP layout).
//
// Requires dist/api/api.zip (npm run build) and
// dist/lambda-dist/lambda-dist.zip (npm run build-lambda-dist) to exist.
//
// Usage: node bin/artifact-smoke-test.js
// (--invoke <task-root> <handler-dir> is the internal per-bundle child mode;
// each bundle needs its own process because LAMBDA_TASK_ROOT is captured at
// module load.)

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const CHECKS = [
  { path: '/', mustInclude: '"stac_version"' },
  { path: '/conformance', mustInclude: 'conformsTo' },
  { path: '/api', mustInclude: 'openapi' },
  { path: '/api.html', mustInclude: 'redoc' },
]

// None of the checked routes query the database, so a placeholder host is
// enough to let the app initialize.
const CHILD_ENV = {
  AWS_REGION: 'us-east-1',
  ENABLE_TRANSACTIONS_EXTENSION: 'false',
  OPENSEARCH_HOST: 'localhost:9200',
}

const apiGatewayEvent = (path) => ({
  resource: '/{proxy+}',
  path,
  httpMethod: 'GET',
  headers: { Host: 'example.com', 'X-Forwarded-Proto': 'https' },
  multiValueHeaders: { Host: ['example.com'] },
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  pathParameters: path === '/' ? null : { proxy: path.slice(1) },
  stageVariables: null,
  body: null,
  isBase64Encoded: false,
  requestContext: {
    accountId: '123456789012',
    apiId: 'smoke-test',
    authorizer: null,
    protocol: 'HTTP/1.1',
    httpMethod: 'GET',
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

const invokeBundle = async (taskRoot, handlerDir) => {
  process.env['LAMBDA_TASK_ROOT'] = taskRoot

  const require = createRequire(import.meta.url)
  // The bundle top-level-awaits its app creation, so module.exports is a
  // promise; await unwraps it (and is a no-op if it ever becomes a plain object).
  // eslint-disable-next-line import/no-dynamic-require
  const { handler } = await require(join(handlerDir, 'index.js'))

  let failures = 0
  for (const { path, mustInclude } of CHECKS) {
    // eslint-disable-next-line no-await-in-loop
    const result = await handler(
      apiGatewayEvent(path),
      { getRemainingTimeInMillis: () => 30000 }
    )
    const body = result.isBase64Encoded
      ? Buffer.from(result.body, 'base64').toString('utf8')
      : String(result.body)

    const problems = []
    if (result.statusCode !== 200) problems.push(`status ${result.statusCode}`)
    if (!body.includes(mustInclude)) problems.push(`body missing "${mustInclude}"`)

    if (problems.length) {
      failures += 1
      console.error(`  FAIL GET ${path}: ${problems.join(', ')}`)
    } else {
      console.log(`  ok   GET ${path}`)
    }
  }
  return failures
}

const runParent = () => {
  const self = fileURLToPath(import.meta.url)
  const artifacts = [
    { zip: 'dist/api/api.zip', handlerSubdir: '.' },
    { zip: 'dist/lambda-dist/lambda-dist.zip', handlerSubdir: 'api' },
  ]

  let failed = false
  for (const { zip, handlerSubdir } of artifacts) {
    if (existsSync(zip)) {
      const dir = mkdtempSync(join(tmpdir(), 'stac-server-artifact-'))
      try {
        execFileSync('unzip', ['-q', zip, '-d', dir])
        console.log(`${zip}:`)
        const child = spawnSync(
          process.execPath,
          [self, '--invoke', dir, join(dir, handlerSubdir)],
          { stdio: 'inherit', env: { ...process.env, ...CHILD_ENV } }
        )
        if (child.status !== 0) failed = true
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    } else {
      console.error(`FAIL ${zip}: not found (run the build first)`)
      failed = true
    }
  }

  process.exit(failed ? 1 : 0)
}

if (process.argv[2] === '--invoke') {
  const [, , , taskRoot, handlerDir] = process.argv
  const failures = await invokeBundle(taskRoot, handlerDir)
  process.exit(failures === 0 ? 0 : 1)
} else {
  runParent()
}
