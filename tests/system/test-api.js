const test = require('ava')
const { apiClient } = require('../helpers/api-client')
const intersectsGeometry = require('../fixtures/stac/intersectsGeometry.json')
const noIntersectsGeometry = require('../fixtures/stac/noIntersectsGeometry.json')
const { refreshIndices } = require('../helpers/es')
const { randomId } = require('../helpers/utils')

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

test('/collections/{collectionId}/items/{itemId}', async (t) => {
  const response = await apiClient.get('collections/landsat-8-l1/items/LC80100102015082LGN00')
  t.is(response.type, 'Feature')
  t.is(response.id, 'LC80100102015082LGN00')
})

test('GET /collections/:collectionId/items/:itemId has a content type of "application/geo+json"', async (t) => {
  const response = await apiClient.get('collections/landsat-8-l1/items/LC80100102015082LGN00', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
})

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

test('/', async (t) => {
  const response = await apiClient.get('')
  t.true(Array.isArray(response.links))
})

test('GET /search returns an empty list of results for a collection that does not exist', async (t) => {
  const response = await apiClient.get('search', {
    searchParams: {
      collections: randomId('collection')
    }
  })

  t.true(Array.isArray(response.features))
  t.is(response.features.length, 0)
})

test('POST /search returns an empty list of results for a collection that does not exist', async (t) => {
  const response = await apiClient.post('search', {
    json: {
      collections: randomId('collection')
    },
    searchParams: {
      collections: randomId('collection')
    }
  })

  t.true(Array.isArray(response.features))
  t.is(response.features.length, 0)
})

test.skip('/search bbox', async (t) => {
  let response = await apiClient.post('search', {
    json: {
      bbox: [-180, -90, 180, 90]
    }
  })
  t.is(response.type, 'FeatureCollection')

  const ids = response.features.map((item) => item.id)
  t.truthy(ids.indexOf('LC80100102015082LGN00') > -1)
  t.truthy(ids.indexOf('collection2_item') > -1)

  response = await apiClient.post('search', {
    json: {
      bbox: [-5, -5, 5, 5]
    }
  })
  t.is(response.features.length, 0)
})

test('GET /search has a content type of "application/geo+json; charset=utf-8', async (t) => {
  const response = await apiClient.get('search', {
    resolveBodyOnly: false
  })

  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
})

test('POST /search has a content type of "application/geo+json; charset=utf-8', async (t) => {
  const response = await apiClient.post('search', {
    json: {},
    resolveBodyOnly: false
  })

  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
})

test('/search default sort', async (t) => {
  const response = await apiClient.post('search', { json: {} })
  t.is(response.features[0].id, 'LC80100102015082LGN00')
})

test('/search sort', async (t) => {
  let response = await apiClient.post('search', {
    json: {
      sort: [{
        field: 'eo:cloud_cover',
        direction: 'desc'
      }]
    }
  })
  t.is(response.features[0].id, 'LC80100102015082LGN00')

  response = await apiClient.post('search', {
    json: {
      sort: '[{ "field": "eo:cloud_cover", "direction": "desc" }]'
    }
  })
  t.is(response.features[0].id, 'LC80100102015082LGN00')
})

test('/search flattened collection properties', async (t) => {
  let response = await apiClient.post('search', {
    json: {
      query: {
        'platform': {
          eq: 'platform2'
        }
      }
    }
  })
  t.is(response.features[0].id, 'collection2_item')

  response = await apiClient.post('search', {
    json: {
      query: {
        'platform': {
          eq: 'landsat-8'
        }
      },
      fields: {
        include: ['properties.platform']
      }
    }
  })
  const havePlatform = response.features.filter(
    (item) => (item.properties.platform === 'landsat-8')
  )
  t.is(havePlatform.length, response.features.length)
})

test('/search fields filter', async (t) => {
  let response = await apiClient.post('search', {
    json: {
      fields: {
      }
    }
  })
  t.truthy(response.features[0].collection)
  t.truthy(response.features[0].id)
  t.truthy(response.features[0].type)
  t.truthy(response.features[0].geometry)
  t.truthy(response.features[0].bbox)
  t.truthy(response.features[0].links)
  t.truthy(response.features[0].assets)

  response = await apiClient.post('search', {
    json: {
      fields: {
        exclude: ['collection']
      }
    }
  })
  t.falsy(response.features[0].collection)

  response = await apiClient.post('search', {
    json: {
      fields: {
        exclude: ['geometry']
      }
    }
  })
  t.falsy(response.features[0].geometry)

  response = await apiClient.post('search', {
    json: {
      fields: {
        include: ['properties'],
        exclude: ['properties.datetime']
      }
    }
  })
  t.falsy(response.features[0].properties.datetime)

  response = await apiClient.post('search', { json: {} })
  t.truthy(response.features[0].geometry)

  response = await apiClient.post('search', {
    json: {
      fields: {
        include: ['collection', 'properties.eo:epsg']
      }
    }
  })
  t.truthy(response.features[0].collection)
  t.truthy(response.features[0].properties['eo:epsg'])
  t.falsy(response.features[0].properties['eo:cloud_cover'])

  response = await apiClient.post('search', {
    json: {
      fields: {
        exclude: ['id', 'links']
      }
    }
  })
  t.truthy(response.features.length, 'Does not exclude required fields')
})

test('/search created and updated', async (t) => {
  const response = await apiClient.post('search', {
    json: {
      query: {
        'platform': {
          eq: 'landsat-8'
        }
      },
      fields: {
        include: ['properties.created', 'properties.updated']
      }
    }
  })
  t.truthy(response.features[0].properties.created)
  t.truthy(response.features[0].properties.updated)
})

test('/search in query', async (t) => {
  const response = await apiClient.post('search', {
    json: {
      query: {
        'landsat:wrs_path': {
          in: ['10']
        }
      }
    }
  })
  t.is(response.features.length, 3)
})

test('/search limit next query', async (t) => {
  let response = await apiClient.post('search', {
    json: {
      query: {
        'landsat:wrs_path': {
          in: ['10']
        }
      },
      limit: 2
    }
  })
  t.is(response.features.length, 2)

  response = await apiClient.post('search', {
    json: {
      query: {
        'landsat:wrs_path': {
          in: ['10']
        }
      },
      limit: 2,
      page: 2
    }
  })

  t.is(response.features.length, 1)
})

test('/search ids', async (t) => {
  const response = await apiClient.post('search', {
    json: {
      ids: ['collection2_item', 'LC80100102015050LGN00']
    }
  })
  t.is(response.features.length, 2)

  const ids = response.features.map((item) => item.id)
  t.truthy(ids.indexOf('LC80100102015050LGN00') > -1)
  t.truthy(ids.indexOf('collection2_item') > -1)
})

test('/search collections', async (t) => {
  let query = {
    collections: ['collection2']
  }
  let response = await apiClient.post('search', { json: query })
  t.is(response.features.length, 1)
  t.is(response.features[0].id, 'collection2_item')

  query = {
    collections: ['landsat-8-l1']
  }

  response = await apiClient.post('search', { json: query })

  t.is(response.features.length, 2)
  t.is(response.features[0].id, 'LC80100102015082LGN00')
  t.is(response.features[1].id, 'LC80100102015050LGN00')

  query = {
    collections: ['collection2', 'landsat-8-l1']
  }

  response = await apiClient.post('search', { json: query })
  t.is(response.features.length, 3)
})

test('GET /conformance returns the expected conformsTo list', async (t) => {
  const response = await apiClient.get('conformance')
  t.is(response.conformsTo.length, 13)
})

test('GET /conformance has a content type of "application/json', async (t) => {
  const response = await apiClient.get('conformance', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
})

test.skip('/search preserve geometry in page GET links', async (t) => {
  let response = await apiClient.post('search', {
    json: {
      intersects: intersectsGeometry,
      limit: 2
    }
  })
  t.is(response.features.length, 2)

  response = await apiClient.post('search', {
    json: {
      intersects: intersectsGeometry,
      limit: 2,
      page: 2
    }
  })

  response = await apiClient.post('search', {
    json: {
      intersects: encodeURIComponent(JSON.stringify(intersectsGeometry)),
      limit: 2,
      page: 2
    }
  })

  t.is(response.features.length, 1)

  const datetime = '2015-02-19/2015-02-20'
  response = await apiClient.post('search', {
    json: {
      intersects: intersectsGeometry,
      datetime: datetime,
      limit: 1
    }
  })
  t.is(response.features.length, 1)

  const next = response.links[0].href
  const params = {}
  next.split('?', 2)[1].split('&').forEach((pair) => {
    const [key, val] = pair.split('=', 2)
    params[key] = decodeURIComponent(val)
  })
  t.is(params.datetime, datetime)
})
