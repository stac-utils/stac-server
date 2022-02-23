// @ts-check

const { default: test } = require('ava')
const { apiClient } = require('../helpers/api-client')

test('GET /api response contains an "openapi" property', async (t) => {
  const response = await apiClient.get('api')

  t.true('openapi' in response)
})

test('GET /api has a content type of "application/json', async (t) => {
  const response = await apiClient.get('api', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/vnd.oai.openapi; charset=utf-8')
})
