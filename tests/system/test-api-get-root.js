const test = require('ava')
const { apiClient } = require('../helpers/api-client')

test('/', async (t) => {
  const response = await apiClient.get('')
  t.true(Array.isArray(response.links))
})
