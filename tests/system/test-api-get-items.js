const test = require('ava')
const { apiClient } = require('../helpers/api-client')

test('/collections/{collectionId}/items', async (t) => {
  const response = await apiClient.get('collections/landsat-8-l1/items')
  t.is(response.type, 'FeatureCollection')
  t.is(response.features.length, 2)
  t.is(response.features[0].id, 'LC80100102015082LGN00')
  t.is(response.features[1].id, 'LC80100102015050LGN00')
})

test('GET /collections/{collectionId}/items has a content type of "application/geo+json"', async (t) => {
  const response = await apiClient.get('collections/landsat-8-l1/items', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
})
