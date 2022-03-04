const test = require('ava')
const { startApi } = require('../helpers/api')

test.before(async (t) => {
  t.context.api = await startApi()
})

test.after.always(async (t) => {
  await t.context.api.close()
})

test('GET /conformance returns the expected conformsTo list', async (t) => {
  const response = await t.context.api.client.get('conformance')
  t.is(response.conformsTo.length, 14)
})

test('GET /conformance has a content type of "application/json', async (t) => {
  const response = await t.context.api.client.get('conformance', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
})
