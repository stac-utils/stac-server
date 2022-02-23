const test = require('ava')
const { apiClient } = require('../helpers/api-client')
const intersectsGeometry = require('../fixtures/stac/intersectsGeometry.json')
const noIntersectsGeometry = require('../fixtures/stac/noIntersectsGeometry.json')

test('/collections/{collectionId}/items with bbox 1', async (t) => {
  const response = await apiClient.post('collections/landsat-8-l1/items', {
    json: {
      bbox: [-180, -90, 180, 90]
    }
  })
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, 'LC80100102015082LGN00')
  t.is(response.features[1].id, 'LC80100102015050LGN00')
})

test('/collections/{collectionId}/items with bbox 2', async (t) => {
  const response = await apiClient.post('collections/landsat-8-l1/items', {
    json: {
      bbox: [-5, -5, 5, 5]
    }
  })

  t.is(response.features.length, 0)
})

test('/collections/{collectionId}/items with bbox and intersects', async (t) => {
  const response = await apiClient.post('collections/landsat-8-l1/items', {
    json: {
      bbox: [-180, -90, 180, 90],
      intersects: intersectsGeometry
    }
  })

  t.truthy(response.context.matched === 2)
})

test('/collections/{collectionId}/items with time', async (t) => {
  let response = await apiClient.post('collections/landsat-8-l1/items', {
    json: {
      datetime: '2015-02-19T15:06:12.565047+00:00'
    }
  })
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, 'LC80100102015050LGN00')

  response = await apiClient.post('collections/landsat-8-l1/items', {
    json: {
      datetime: '2015-02-17/2015-02-20'
    }
  })
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, 'LC80100102015050LGN00')

  response = await apiClient.post('collections/landsat-8-l1/items', {
    json: {
      datetime: '2015-02-19/2015-02-20'
    }
  })
  t.is(
    response.features[0].id,
    'LC80100102015050LGN00',
    'Handles date range without times inclusion issue'
  )
})

test('/collections/{collectionId}/items with limit', async (t) => {
  const response = await apiClient.post('collections/landsat-8-l1/items', {
    json: {
      limit: 1
    }
  })
  t.is(response.type, 'FeatureCollection')
  t.is(response.features.length, 1)
})

test('/collections/{collectionId}/items with intersects', async (t) => {
  let response = await apiClient.post('collections/landsat-8-l1/items', {
    json: {
      intersects: intersectsGeometry
    }
  })
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, 'LC80100102015082LGN00')
  t.is(response.features[1].id, 'LC80100102015050LGN00')

  response = await apiClient.post('collections/landsat-8-l1/items', {
    json: {
      intersects: noIntersectsGeometry
    }
  })
  t.is(response.features.length, 0)
})

test('/collections/{collectionId}/items with eq query', async (t) => {
  const response = await apiClient.post('collections/landsat-8-l1/items', {
    json: {
      query: {
        'eo:cloud_cover': {
          eq: 0.54
        }
      }
    }
  })
  t.is(response.features.length, 1)
  t.is(response.features[0].id, 'LC80100102015050LGN00')
})

test('/collections/{collectionId}/items with gt lt query', async (t) => {
  const response = await apiClient.post('collections/landsat-8-l1/items', {
    json: {
      query: {
        'eo:cloud_cover': {
          gt: 0.5,
          lt: 0.6
        }
      }
    }
  })
  t.is(response.features.length, 1)
  t.is(response.features[0].id, 'LC80100102015050LGN00')
})
