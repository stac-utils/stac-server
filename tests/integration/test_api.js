const test = require('ava')
process.env.ES_HOST = `http://${process.env.DOCKER_NAME}:4571`
process.env.AWS_ACCESS_KEY_ID = 'none'
process.env.AWS_SECRET_ACCESS_KEY = 'none'
const backend = require('../../libs/es')
const api = require('../../libs/api')
const intersectsFeature = require('../fixtures/stac/intersectsFeature.json')
const intersectsGeometry = require('../fixtures/stac/intersectsGeometry.json')
const noIntersectsGeometry = require('../fixtures/stac/noIntersectsGeometry.json')

const { API } = api
const endpoint = 'endpoint'

test('collections', async (t) => {
  const response = await API('/collections', {}, backend, endpoint)
  t.is(response.collections.length, 2)
  t.is(response.context.returned, 2)
})

test('collections/{collectionId}', async (t) => {
  let response = await API('/collections/landsat-8-l1', {}, backend, endpoint)
  t.is(response.id, 'landsat-8-l1')
  response = await API('/collections/collection2', {}, backend, endpoint)
  t.is(response.id, 'collection2')
})

test('collections/{collectionId}/items', async (t) => {
  const response = await API('/collections/landsat-8-l1/items',
    {}, backend, endpoint)
  t.is(response.type, 'FeatureCollection')
  t.is(response.features.length, 2)
  t.is(response.features[0].id, 'LC80100102015082LGN00')
  t.is(response.features[1].id, 'LC80100102015050LGN00')
})

test('collections/{collectionId}/items/{itemId}', async (t) => {
  const response =
    await API('/collections/landsat-8-l1/items/LC80100102015082LGN00',
      {}, backend, endpoint)
  t.is(response.type, 'Feature')
  t.is(response.id, 'LC80100102015082LGN00')
})

test('collections/{collectionId}/items with bbox', async (t) => {
  let response = await API('/collections/landsat-8-l1/items', {
    bbox: [-180, -90, 180, 90]
  }, backend, endpoint)
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, 'LC80100102015082LGN00')
  t.is(response.features[1].id, 'LC80100102015050LGN00')

  response = await API('/collections/landsat-8-l1/items', {
    bbox: [-5, -5, 5, 5]
  }, backend, endpoint)
  t.is(response.features.length, 0)
})

test('collections/{collectionId}/items with bbox and intersects', async (t) => {
  const response = await API('/collections/landsat-8-l1/items', {
    bbox: [-180, -90, 180, 90],
    intersects: intersectsGeometry
  }, backend, endpoint)

  t.truthy(response.context.matched === 2)
})

test('collections/{collectionId}/items with time', async (t) => {
  let response = await API('/collections/landsat-8-l1/items', {
    datetime: '2015-02-19T15:06:12.565047+00:00'
  }, backend, endpoint)
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, 'LC80100102015050LGN00')

  response = await API('/collections/landsat-8-l1/items', {
    datetime: '2015-02-17/2015-02-20'
  }, backend, endpoint)
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, 'LC80100102015050LGN00')

  response = await API('/collections/landsat-8-l1/items', {
    datetime: '2015-02-19/2015-02-20'
  }, backend, endpoint)
  t.is(response.features[0].id, 'LC80100102015050LGN00',
    'Handles date range without times inclusion issue')
})

test('collections/{collectionId}/items with limit', async (t) => {
  const response = await API('/collections/landsat-8-l1/items', {
    limit: 1
  }, backend, endpoint)
  t.is(response.type, 'FeatureCollection')
  t.is(response.features.length, 1)
})

test('collections/{collectionId}/items with intersects', async (t) => {
  let response = await API('/collections/landsat-8-l1/items', {
    intersects: intersectsGeometry
  }, backend, endpoint)
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, 'LC80100102015082LGN00')
  t.is(response.features[1].id, 'LC80100102015050LGN00')

  // response = await API('/collections/landsat-8-l1/items', {
  //   intersects: intersectsFeature
  // }, backend, endpoint)
  // t.truthy(response.code)

  response = await API('/collections/landsat-8-l1/items', {
    intersects: noIntersectsGeometry
  }, backend, endpoint)
  t.is(response.features.length, 0)
})

test('collections/{collectionId}/items with eq query', async (t) => {
  const response = await API('/collections/landsat-8-l1/items', {
    query: {
      'eo:cloud_cover': {
        eq: 0.54
      }
    }
  }, backend, endpoint)
  t.is(response.features.length, 1)
  t.is(response.features[0].id, 'LC80100102015050LGN00')
})

test('collections/{collectionId}/items with gt lt query', async (t) => {
  const response = await API('/collections/landsat-8-l1/items', {
    query: {
      'eo:cloud_cover': {
        gt: 0.5,
        lt: 0.6
      }
    }
  }, backend, endpoint)
  t.is(response.features.length, 1)
  t.is(response.features[0].id, 'LC80100102015050LGN00')
})

// Search API

test('search', async (t) => {
  const response = await API('/', {}, backend, endpoint)
  // console.log(response.links)
  t.is(response.links.length, 8)
})

test('search bbox', async (t) => {
  let response = await API('/search', {
    bbox: [-180, -90, 180, 90]
  }, backend, endpoint)
  t.is(response.type, 'FeatureCollection')

  const ids = response.features.map((item) => item.id)
  t.truthy(ids.indexOf('LC80100102015082LGN00') > -1)
  t.truthy(ids.indexOf('collection2_item') > -1)

  response = await API('/search', {
    bbox: [-5, -5, 5, 5]
  }, backend, endpoint)
  t.is(response.features.length, 0)
})

test('search default sort', async (t) => {
  const response = await API('/search', {}, backend, endpoint)
  t.is(response.features[0].id, 'LC80100102015082LGN00')
})

test('search sort', async (t) => {
  let response = await API('/search', {
    sort: [{
      field: 'eo:cloud_cover',
      direction: 'desc'
    }]
  }, backend, endpoint)
  t.is(response.features[0].id, 'LC80100102015082LGN00')

  response = await API('/search', {
    sort: '[{ "field": "eo:cloud_cover", "direction": "desc" }]'
  }, backend, endpoint)
  t.is(response.features[0].id, 'LC80100102015082LGN00')
})

test('search flattened collection properties', async (t) => {
  let response = await API('/search', {
    query: {
      'platform': {
        eq: 'platform2'
      }
    }
  }, backend, endpoint)
  t.is(response.features[0].id, 'collection2_item')

  response = await API('/search', {
    query: {
      'platform': {
        eq: 'landsat-8'
      }
    },
    fields: {
      include: ['properties.platform']
    }
  }, backend, endpoint)
  const havePlatform =
    response.features.filter(
      (item) => (item.properties['platform'] === 'landsat-8')
    )
  t.is(havePlatform.length, response.features.length)
})


test('search fields filter', async (t) => {
  let response = await API('/search', {
    fields: {
    }
  }, backend, endpoint)
  t.truthy(response.features[0].collection)
  t.truthy(response.features[0].id)
  t.truthy(response.features[0].type)
  t.truthy(response.features[0].geometry)
  t.truthy(response.features[0].bbox)
  t.truthy(response.features[0].links)
  t.truthy(response.features[0].assets)

  response = await API('/search', {
    fields: {
      exclude: ['collection']
    }
  }, backend, endpoint)
  t.falsy(response.features[0].collection)

  response = await API('/search', {
    fields: {
      exclude: ['geometry']
    }
  }, backend, endpoint)
  t.falsy(response.features[0].geometry)

  response = await API('/search', {
    fields: {
      include: ['properties'],
      exclude: ['properties.datetime']
    }
  }, backend, endpoint)
  t.falsy(response.features[0].properties.datetime)

  response = await API('/search', {
  }, backend, endpoint)
  t.truthy(response.features[0].geometry)

  response = await API('/search', {
    fields: {
      include: ['collection', 'properties.eo:epsg']
    }
  }, backend, endpoint)
  t.truthy(response.features[0].collection)
  t.truthy(response.features[0].properties['eo:epsg'])
  t.falsy(response.features[0].properties['eo:cloud_cover'])

  response = await API('/search', {
    fields: {
      exclude: ['id', 'links']
    }
  }, backend, endpoint)
  t.truthy(response.features.length, 'Does not exclude required fields')
})

test('search created and updated', async (t) => {
  const response = await API('/search', {
    query: {
      'platform': {
        eq: 'landsat-8'
      }
    },
    fields: {
      include: ['properties.created', 'properties.updated']
    }
  }, backend, endpoint)
  t.truthy(response.features[0].properties.created)
  t.truthy(response.features[0].properties.updated)
})

test('search in query', async (t) => {
  const response = await API('/search', {
    query: {
      'landsat:wrs_path': {
        in: ['10']
      }
    }
  }, backend, endpoint)
  t.is(response.features.length, 3)
})

test('search limit next query', async (t) => {
  let response = await API('/search', {
    query: {
      'landsat:wrs_path': {
        in: ['10']
      }
    },
    limit: 2
  }, backend, endpoint)
  t.is(response.features.length, 2)

  response = await API('/search', {
    query: {
      'landsat:wrs_path': {
        in: ['10']
      }
    },
    limit: 2,
    page: 2
  }, backend, endpoint)

  t.is(response.features.length, 1)
})

test('search ids', async (t) => {
  const response = await API('/search', {
    ids: ['collection2_item', 'LC80100102015050LGN00']
  }, backend, endpoint)
  t.is(response.features.length, 2)

  const ids = response.features.map((item) => item.id)
  t.truthy(ids.indexOf('LC80100102015050LGN00') > -1)
  t.truthy(ids.indexOf('collection2_item') > -1)
})

test('search collections', async (t) => {
  // const query = {
  //   query: {
  //     collection: {
  //       in: ['collection2']
  //     }
  //   }
  // }
  let query = {
    collections: ['collection2']
  }
  let response = await API('/search', query, backend, endpoint)
  t.is(response.features.length, 1)
  t.is(response.features[0].id, 'collection2_item')

  // query = {
  //   query: {
  //     collection: {
  //       in: ['landsat-8-l1']
  //     }
  //   }
  // }

  query = {
    collections: ['landsat-8-l1']
  }

  response = await API('/search', query, backend, endpoint)

  t.is(response.features.length, 2)
  t.is(response.features[0].id, 'LC80100102015082LGN00')
  t.is(response.features[1].id, 'LC80100102015050LGN00')

  // query =  {
  //   query: {
  //     collection: {
  //       in: ['collection2', 'landsat-8-l1']
  //     }
  //   }
  // }

  query = {
    collections: ['collection2', 'landsat-8-l1']
  }

  response = await API('/search', query, backend, endpoint)
  t.is(response.features.length, 3)
})

// Search formatting
test('search conformsTo', async (t) => {
  const response = await API('/', {}, backend, endpoint)
  t.is(response.conformsTo.length, 5)
})

test('search preserve geometry in page GET links', async (t) => {
  let response = await API('/search', {
    intersects: intersectsGeometry,
    limit: 2
  }, backend, endpoint)
  t.is(response.features.length, 2)

  response = await API('/search', {
    intersects: intersectsGeometry,
    limit: 2,
    page: 2
  }, backend, endpoint)

  response = await API('/search', {
    intersects: encodeURIComponent(JSON.stringify(intersectsGeometry)),
    limit: 2,
    page: 2
  }, backend, endpoint)

  t.is(response.features.length, 1)

  const datetime = '2015-02-19/2015-02-20'
  response = await API('/search', {
    intersects: intersectsGeometry,
    datetime: datetime,
    limit: 1
  }, backend, endpoint)
  t.is(response.features.length, 1)

  const next = response.links[0].href
  const params = {}
  next.split('?', 2)[1].split('&').forEach((pair) => {
    const [key, val] = pair.split('=', 2)
    params[key] = decodeURIComponent(val)
  })
  t.is(params.datetime, datetime)
})
