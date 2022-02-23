const test = require('ava')
const { apiClient } = require('../helpers/api-client')

test('/collections/landsat-8-l1', async (t) => {
  const response = await apiClient.get('collections/landsat-8-l1')

  t.is(response.id, 'landsat-8-l1')
})

test('GET /collection/landsat-8-l1 has a content type of "application/json', async (t) => {
  const response = await apiClient.get('collections/landsat-8-l1', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
})

test('/collections/collection2', async (t) => {
  const response = await apiClient.get('collections/collection2')

  t.is(response.id, 'collection2')
})
