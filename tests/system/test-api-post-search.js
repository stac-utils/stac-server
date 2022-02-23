const test = require('ava')
const { apiClient } = require('../helpers/api-client')
const { randomId } = require('../helpers/utils')
const intersectsGeometry = require('../fixtures/stac/intersectsGeometry.json')

test('POST /search returns an empty list of results for a collection that does not exist', async (t) => {
  const response = await apiClient.post('search', {
    json: {
      collections: [randomId('collection')]
    },
    searchParams: {
      collections: randomId('collection')
    }
  })

  t.true(Array.isArray(response.features))
  t.is(response.features.length, 0)
})

test("POST /search returns results when one collection exists and another doesn't", async (t) => {
  const response = await apiClient.post('search', {
    json: {
      collections: [
        'collection2',
        randomId('collection')
      ]
    },
    searchParams: {
      collections: randomId('collection')
    }
  })

  t.true(Array.isArray(response.features))
  t.true(response.features.length > 0)
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
