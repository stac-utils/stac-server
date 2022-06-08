const { default: test } = require('ava')
const { handler } = require('../../src/lambdas/api')
const { setupResources } = require('../helpers/system-tests')
const { randomId } = require('../helpers/utils')
const { disableNetConnect, event } = require('../helpers/aws-tests')

test.before(async () => {
  disableNetConnect()
  await setupResources()
})

test.beforeEach(() => {
  delete process.env['PRE_HOOK']
})

test('Without a pre-hook, the expected response is returned', async (t) => {
  const response = await handler(event)

  t.is(response.statusCode, 200)

  t.regex(response.headers['content-type'], /^application\/json/)

  const body = JSON.parse(response.body)

  t.is(body.id, 'stac-server')
})

test('When the pre-hook returns a proxy output response, that response is returned', async (t) => {
  process.env['PRE_HOOK'] = 'stac-server-aws-test-lambda-5'

  const response = await handler(event, {})

  t.is(response.statusCode, 418)
})

test('An internal server error is returned if invoking the pre-hook fails', async (t) => {
  process.env['PRE_HOOK'] = randomId('lambda')

  const response = await handler(event)

  t.is(response.statusCode, 500)
})

test('An internal server error is returned if the pre-hook lambda throws', async (t) => {
  process.env['PRE_HOOK'] = 'stac-server-aws-test-lambda-2'

  const response = await handler(event)

  t.is(response.statusCode, 500)
})

test('An internal server error is returned if the pre-hook response payload is malformed', async (t) => {
  process.env['PRE_HOOK'] = 'stac-server-aws-test-lambda-3'

  const response = await handler(event)

  t.is(response.statusCode, 500)
})

test('An internal server error is returned if the pre-hook response payload is not a JSON object', async (t) => {
  process.env['PRE_HOOK'] = 'stac-server-aws-test-lambda-4'

  const response = await handler(event)

  t.is(response.statusCode, 500)
})

test('A pre-hook can modify a request', async (t) => {
  process.env['PRE_HOOK'] = 'stac-server-aws-test-lambda-6'

  const response = await handler(event)

  t.is(response.statusCode, 200)

  t.regex(response.headers['content-type'], /^text\/html/)
})
