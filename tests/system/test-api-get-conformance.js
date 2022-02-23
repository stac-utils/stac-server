const test = require('ava')
const { apiClient } = require('../helpers/api-client')

test('GET /conformance returns the expected conformsTo list', async (t) => {
  const response = await apiClient.get('conformance')
  t.is(response.conformsTo.length, 13)
})

test('GET /conformance has a content type of "application/json', async (t) => {
  const response = await apiClient.get('conformance', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
})
