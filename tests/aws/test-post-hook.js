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
  delete process.env['POST_HOOK']
})

test('Without a post-hook, the original response is returned', async (t) => {
  const response = await handler(event)

  t.is(response.statusCode, 200)

  t.regex(response.headers['content-type'], /^application\/json/)

  const body = JSON.parse(response.body)

  t.is(body.id, 'stac-server')
})

test('The post-hook can modify the API response', async (t) => {
  process.env['POST_HOOK'] = 'stac-server-aws-test-lambda-1'

  const response = await handler(event)

  t.regex(response.headers['content-type'], /^application\/json/)

  const body = JSON.parse(response.body)
  t.is(body.id, 'stac-server-xxx')
})

test('An internal server error is returned if invoking the post-hook fails', async (t) => {
  process.env['POST_HOOK'] = randomId('lambda')

  const response = await handler(event)

  t.is(response.statusCode, 500)
})

test('An internal server error is returned if the post-hook lambda throws', async (t) => {
  process.env['POST_HOOK'] = 'stac-server-aws-test-lambda-2'

  const response = await handler(event)

  t.is(response.statusCode, 500)
})

test('An internal server error is returned if the post-hook response payload is malformed', async (t) => {
  process.env['POST_HOOK'] = 'stac-server-aws-test-lambda-3'

  const response = await handler(event)

  t.is(response.statusCode, 500)
})

test('An internal server error is returned if the post-hook response payload is not a JSON object', async (t) => {
  process.env['POST_HOOK'] = 'stac-server-aws-test-lambda-4'

  const response = await handler(event)

  t.is(response.statusCode, 500)
})
