const test = require('ava')
const { apiClient } = require('../helpers/api-client')
const { randomId } = require('../helpers/utils')

test('GET /search returns an empty list of results for a collection that does not exist', async (t) => {
  const collectionId = randomId('collection')
  const searchParams = new URLSearchParams({ collections: [collectionId] })

  const response = await apiClient.get('search', { searchParams })

  t.true(Array.isArray(response.features))
  t.is(response.features.length, 0)
})

test('GET /search has a content type of "application/geo+json; charset=utf-8', async (t) => {
  const response = await apiClient.get('search', {
    resolveBodyOnly: false
  })

  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
})
