const test = require('ava')
const { apiClient } = require('../helpers/api-client')
const { refreshIndices } = require('../helpers/es')

test('/collections', async (t) => {
  await refreshIndices()

  const response = await apiClient.get('collections')

  t.true(Array.isArray(response.collections))
  t.true(response.collections.length > 0)

  t.truthy(response.context.returned)
})

test('GET /collections has a content type of "application/json', async (t) => {
  const response = await apiClient.get('collections', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
})
