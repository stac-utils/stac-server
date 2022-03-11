const test = require('ava')
const { startApi } = require('../helpers/api')

test.before(async (t) => {
  t.context.api = await startApi()
})

test.after.always(async (t) => {
  await t.context.api.close()
})

test('GET /api returns OpenAPI description', async (t) => {
  const response = await t.context.api.client.get('api',
    { resolveBodyOnly: false, responseType: 'text' })

  t.is(response.headers['content-type'], 'application/vnd.oai.openapi')
  t.true(response.body.includes('openapi'))
})
