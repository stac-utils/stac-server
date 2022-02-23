const test = require('ava')
const { apiClient } = require('../helpers/api-client')

test('/collections/{collectionId}/items/{itemId}', async (t) => {
  const response = await apiClient.get('collections/landsat-8-l1/items/LC80100102015082LGN00')
  t.is(response.type, 'Feature')
  t.is(response.id, 'LC80100102015082LGN00')
})

test('GET /collections/:collectionId/items/:itemId has a content type of "application/geo+json"', async (t) => {
  const response = await apiClient.get('collections/landsat-8-l1/items/LC80100102015082LGN00', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
})
