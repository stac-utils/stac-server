const test = require('ava')
const { startApi } = require('../helpers/api')

test.before(async (t) => {
  t.context.api = await startApi()
})

test.after.always(async (t) => {
  await t.context.api.close()
})

test('GET /api response contains an "openapi" property', async (t) => {
  const response = await t.context.api.client.get('api')

  t.true('openapi' in response)
})

test('GET /api has a content type of application/vnd.oai.openapi', async (t) => {
  const response = await t.context.api.client.get('api', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/vnd.oai.openapi; charset=utf-8')
})
