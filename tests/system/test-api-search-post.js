// @ts-nocheck

import test from 'ava'
import { fileURLToPath } from 'url'
import fs from 'fs'
import path from 'path'
import { deleteAllIndices, refreshIndices } from '../helpers/database.js'
import { randomId } from '../helpers/utils.js'
import { processMessages } from '../../src/lib/ingest.js'

import { loadJson, setup } from '../helpers/system-tests.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename) // eslint-disable-line no-unused-vars
const intersectsGeometry = fs.readFileSync(path.resolve(__dirname, '../fixtures/stac/intersectsGeometry.json'), 'utf8')
const noIntersectsGeometry = fs.readFileSync(path.resolve(__dirname, '../fixtures/stac/noIntersectsGeometry.json'), 'utf8')

const fixture = (filepath) => fs.readFileSync(path.resolve(__dirname, filepath), 'utf8')

const ingestEntities = async (fixtures) => {
  await processMessages(
    await Promise.all(fixtures.map((x) => loadJson(x)))
  )
  await refreshIndices()
}

test.before(async (t) => {
  await deleteAllIndices()

  t.context = await setup()

  // ingest collections before items so mappings are applied
  await ingestEntities([
    'collection.json',
    'collection2.json',
  ])

  await ingestEntities([
    'collection2_item.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ])
})

test.beforeEach(async (_) => {
  delete process.env['ENABLE_COLLECTIONS_AUTHX']
  delete process.env['ENABLE_FILTER_AUTHX']
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

const linkRel = (response, rel) =>
  response.links.find((x) => x.rel === rel)

test('POST /search returns an empty list of results for a collection that does not exist', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      collections: [randomId('collection')]
    }
  })

  t.true(Array.isArray(response.features))
  t.is(response.features.length, 0)
})

test("POST /search returns results when one collection exists and another doesn't", async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      collections: [
        'collection2',
        randomId('collection')
      ]
    }
  })

  t.true(Array.isArray(response.features))
  t.true(response.features.length > 0)
})

test('POST /search ignores query parameter collections', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      collections: [
        'collection2'
      ]
    },
    searchParams: {
      collections: randomId('collection')
    }
  })

  t.true(Array.isArray(response.features))
  t.true(response.features.length > 0)
})

test('/search bbox', async (t) => {
  let response = await t.context.api.client.post('search', {
    json: {
      bbox: [-180, -90, 180, 90]
    }
  })
  t.is(response.type, 'FeatureCollection')

  // @ts-expect-error We need to type this response
  const ids = response.features.map((item) => item.id)

  t.truthy(ids.includes('LC80100102015082LGN00'))
  t.truthy(ids.includes('LC80100102015050LGN00'))

  response = await t.context.api.client.post('search', {
    json: {
      bbox: [-5, -5, 5, 5]
    }
  })
  t.is(response.features.length, 0)
})

test('POST /search has a content type of "application/geo+json; charset=utf-8', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {},
    resolveBodyOnly: false
  })

  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
})

test('/search default sort', async (t) => {
  const response = await t.context.api.client.post('search', { json: {} })
  t.is(response.features[0].id, 'LC80100102015082LGN00')
})

test('/search sort', async (t) => {
  let response = await t.context.api.client.post('search', {
    json: {
      sort: [{
        field: 'eo:cloud_cover',
        direction: 'desc'
      }]
    }
  })
  t.is(response.features[0].id, 'LC80100102015082LGN00')

  response = await t.context.api.client.post('search', {
    json: {
      sort: '[{ "field": "eo:cloud_cover", "direction": "desc" }]'
    }
  })
  t.is(response.features[0].id, 'LC80100102015082LGN00')
})

test('/search sort unqualified field names fails', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      sortby: [{
        field: 'datetime',
        direction: 'desc'
      }]
    }
  }))

  t.is(error.response.statusCode, 400)
  t.truthy(error.response.body.description.includes('Hint: `sortby` requires fully qualified identifiers'))
})

test('/search flattened collection properties', async (t) => {
  let response = await t.context.api.client.post('search', {
    json: {
      query: {
        platform: {
          eq: 'platform2'
        }
      }
    }
  })
  t.is(response.features[0].id, 'collection2_item')

  response = await t.context.api.client.post('search', {
    json: {
      query: {
        platform: {
          eq: 'landsat-8'
        }
      },
      fields: {
        include: ['properties.platform']
      }
    }
  })

  const havePlatform = response.features.filter(
    // @ts-expect-error We need to type this response
    (item) => (item.properties.platform === 'landsat-8')
  )
  t.is(havePlatform.length, response.features.length)
})

test('/search fields filter', async (t) => {
  let response = await t.context.api.client.post('search', {
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
  t.truthy(response.features[0].stac_version)

  response = await t.context.api.client.post('search', {
    json: {
      fields: {
        exclude: ['collection']
      }
    }
  })
  t.falsy(response.features[0].collection)

  response = await t.context.api.client.post('search', {
    json: {
      fields: {
        exclude: ['geometry']
      }
    }
  })
  t.falsy(response.features[0].geometry)

  response = await t.context.api.client.post('search', {
    json: {
      fields: {
        include: ['properties'],
        exclude: ['properties.datetime']
      }
    }
  })
  t.falsy(response.features[0].properties.datetime)

  response = await t.context.api.client.post('search', { json: {} })
  t.truthy(response.features[0].geometry)

  response = await t.context.api.client.post('search', {
    json: {
      fields: {
        include: ['collection', 'properties.proj:epsg']
      }
    }
  })
  t.truthy(response.features[0].collection)
  t.truthy(response.features[0].properties['proj:epsg'])
  t.falsy(response.features[0].properties['eo:cloud_cover'])

  response = await t.context.api.client.post('search', {
    json: {
      fields: {
        exclude: ['id', 'links']
      }
    }
  })
  t.truthy(response.features.length, 'Does not exclude required fields')
})

test('/search created and updated', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      query: {
        platform: {
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
  const response = await t.context.api.client.post('search', {
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

test('/search limit only', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      limit: 1
    }
  })
  t.is(response.features.length, 1)
})

test('/search limit and page', async (t) => {
  const response1 = await t.context.api.client.post('search', {
    json: {
      limit: 1,
      page: 1
    }
  })
  const response2 = await t.context.api.client.post('search', {
    json: {
      limit: 1,
      page: 2
    }
  })
  t.true(response1.features[0].id !== response2.features[0].id)
})

test('/search limit next query', async (t) => {
  let response = await t.context.api.client.post('search', {
    json: {
      query: {
        'landsat:wrs_path': {
          in: ['10']
        }
      },
      limit: 1
    }
  })
  t.is(response.features.length, 1)

  const nextLink = linkRel(response, 'next')

  response = await t.context.api.client.post('search', {
    json: {
      query: {
        'landsat:wrs_path': {
          in: ['10']
        }
      },
      limit: 1,
      next: nextLink.body.next
    }
  })

  t.is(response.features.length, 1)
})

test('/search ids', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      ids: ['collection2_item', 'LC80100102015050LGN00']
    }
  })
  t.is(response.features.length, 2)

  // @ts-expect-error We need to type this response
  const ids = response.features.map((item) => item.id)
  t.truthy(ids.includes('LC80100102015050LGN00'))
  t.truthy(ids.includes('collection2_item'))
})

test('/search collections', async (t) => {
  let query = {
    collections: ['collection2']
  }
  let response = await t.context.api.client.post('search', { json: query })
  t.is(response.features.length, 1)
  t.is(response.features[0].id, 'collection2_item')

  query = {
    collections: ['landsat-8-l1']
  }

  response = await t.context.api.client.post('search', { json: query })

  t.is(response.features.length, 2)
  t.is(response.features[0].id, 'LC80100102015082LGN00')
  t.is(response.features[1].id, 'LC80100102015050LGN00')

  query = {
    collections: ['collection2', 'landsat-8-l1']
  }

  response = await t.context.api.client.post('search', { json: query })
  t.is(response.features.length, 3)
})

test('/search preserve intersects geometry in next link', async (t) => {
  let response = await t.context.api.client.post('search', {
    json: {
      intersects: intersectsGeometry,
      limit: 2
    }
  })
  t.is(response.features.length, 2)
  t.is(response.links.length, 2)
  t.truthy(linkRel(response, 'next'))

  response = await t.context.api.client.post('search', {
    json: {
      intersects: intersectsGeometry,
      limit: 1,
      next: linkRel(response, 'next').body.next
    }
  })

  t.is(response.features.length, 1)
  t.is(response.links.length, 2)
  t.truthy(linkRel(response, 'next'))

  // next link is not included when there are 0 items in the results
  response = await t.context.api.client.post('search', {
    json: {
      intersects: intersectsGeometry,
      limit: 1,
      next: linkRel(response, 'next').body.next
    }
  })

  t.is(response.features.length, 0)
  t.is(response.links.length, 1)

  const datetime = '2015-02-19T00:00:00Z/2021-02-19T00:00:00Z'
  response = await t.context.api.client.post('search', {
    json: {
      intersects: intersectsGeometry,
      datetime: datetime,
      limit: 1
    }
  })

  t.is(response.features.length, 1)
  t.is(response.links.length, 2)
  const nextLink = linkRel(response, 'next')
  t.is(nextLink.body.datetime, datetime)
  t.deepEqual(nextLink.body.intersects, intersectsGeometry)
})

test('POST /search - polygon wound incorrectly, but should succeeed', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      intersects: fixture('../fixtures/geometry/polygonWoundCCW.json')
    }
  })
  t.is(response.features.length, 0)
})

test('POST /search - failure when polygon is unclosed', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      intersects: fixture('../fixtures/geometry/badGeoUnclosed.json')
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*invalid LinearRing found \(coordinates are not closed\).*/)
})

test('POST /search - failure when ambigous winding', async (t) => {
  // The right-hand rule part is ok (see:
  // https://github.com/stac-utils/stac-server/issues/549) but there's
  // coinciding points.
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      intersects: fixture('../fixtures/geometry/badGeoRightHandRule.json')
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*failed to create query: Cannot determine orientation: edges adjacent to.*/)
})

test('POST /search - failure when ambigous winding 2', async (t) => {
  // The right-hand rule part is ok (see:
  // https://github.com/stac-utils/stac-server/issues/549) but there's
  // coinciding points.
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      intersects: fixture('../fixtures/geometry/badGeoRightHandRule2.json')
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*failed to create query: Cannot determine orientation: edges adjacent to.*/)
})

test('POST /search - failure when Polygon only has 4 points ', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      intersects: fixture('../fixtures/geometry/badGeoFourPoints.json')
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*failed to create query: at least 4 polygon points required.*/)
})

test('POST /search - failure when shape has duplicate consecutive coordinates', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      intersects: fixture('../fixtures/geometry/badGeoDuplicateConsecutive.json')
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*Provided shape has duplicate consecutive coordinates at.*/)
})

test('POST /search - failure when MultiPolygon has only 4 points', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      intersects: fixture('../fixtures/geometry/badGeoFourPointsMultiPolygon.json')
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*failed to create query: at least 4 polygon points required.*/)
})

test('/search preserve bbox in prev and next links', async (t) => {
  const bbox = [-180, -90, 180, 90]

  let response = await t.context.api.client.post('search', {
    json: {
      bbox,
      limit: 1,
    }
  })

  t.is(response.features.length, 1)
  t.is(response.links.length, 2)
  const prevLink = linkRel(response, 'next')
  t.deepEqual(prevLink.body.bbox, bbox)

  const datetime = '2015-02-19T00:00:00Z/2021-02-19T00:00:00Z'
  response = await t.context.api.client.post('search', {
    json: {
      bbox,
      datetime: datetime,
      limit: 1
    }
  })

  t.is(response.features.length, 1)
  t.is(response.links.length, 2)
  t.is(linkRel(response, 'next').body.datetime, datetime)
  t.deepEqual(linkRel(response, 'next').body.bbox, bbox)
})

test('/search - query extension', async (t) => {
  let response = null

  response = await t.context.api.client.post('search', {
    json: {}
  })
  t.is(response.features.length, 3)

  response = await t.context.api.client.post('search', {
    json: {
      query: {
        platform: {
          eq: 'landsat-8'
        }
      }
    }
  })
  t.is(response.features.length, 2)

  response = await t.context.api.client.post('search', {
    json: {
      query: {
        platform: {
          neq: 'landsat-8'
        }
      }
    }
  })
  t.is(response.features.length, 1)

  response = await t.context.api.client.post('search', {
    json: {
      query: {
        platform: {
          startsWith: 'land'
        }
      }
    }
  })
  t.is(response.features.length, 2)

  response = await t.context.api.client.post('search', {
    json: {
      query: {
        platform: {
          endsWith: '-8'
        }
      }
    }
  })
  t.is(response.features.length, 2)

  response = await t.context.api.client.post('search', {
    json: {
      query: {
        platform: {
          contains: 'ndsa'
        }
      }
    }
  })
  t.is(response.features.length, 2)

  response = await t.context.api.client.post('search', {
    json: {
      query: {
        platform: {
          contains: 'ndsa',
          endsWith: '-8',
          startsWith: 'land',
        }
      }
    }
  })
  t.is(response.features.length, 2)

  response = await t.context.api.client.post('search', {
    json: {
      query: {
        platform: {
          contains: 'ndsa',
          endsWith: '-8',
          startsWith: 'land',
        },
        'eo:cloud_cover': {
          eq: 0.54,
        }
      }
    }
  })
  t.is(response.features.length, 1)

  response = await t.context.api.client.post('search', {
    json: {
      query: {
        platform: {
          contains: 'ndsa',
          neq: 'landsat-8'
        }
      }
    }
  })
  t.is(response.features.length, 0)
})

test('/search - filter extension - comparison operators', async (t) => {
  let response = null

  // equal
  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: '=',
        args: [
          {
            property: 'platform'
          },
          'landsat-8'
        ]
      }
    }
  })
  t.is(response.features.length, 2)

  // not equal
  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: '<>',
        args: [
          {
            property: 'platform'
          },
          'landsat-8'
        ]
      }
    }
  })
  t.is(response.features.length, 1)

  // is null
  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'isNull',
        args: [
          {
            property: 'landsat:product_id'
          }
        ]
      }
    }
  })
  t.is(response.features.length, 3)

  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'isNull',
        args: [
          {
            property: 'gsd'
          }
        ]
      }
    }
  })
  t.is(response.features.length, 2)

  // less than
  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: '<',
        args: [
          {
            property: 'eo:cloud_cover'
          },
          8.0
        ]
      }
    }
  })
  t.is(response.features.length, 2)

  // less than or equal
  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: '<=',
        args: [
          {
            property: 'eo:cloud_cover'
          },
          0.54
        ]
      }
    }
  })
  t.is(response.features.length, 2)

  // greater than
  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: '>',
        args: [
          {
            property: 'eo:cloud_cover'
          },
          0.54
        ]
      }
    }
  })
  t.is(response.features.length, 1)

  // greater than or equal
  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: '>=',
        args: [
          {
            property: 'eo:cloud_cover'
          },
          0.54
        ]
      }
    }
  })
  t.is(response.features.length, 3)
})

test('/search - filter extension - AND logical operator', async (t) => {
  let response = null

  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'and',
        args: [
          {
            op: '>',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              0.54
            ]
          },
          {
            op: '<',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              8.0
            ]
          }
        ]
      }
    }
  })
  t.is(response.features.length, 0)

  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'and',
        args: [
          {
            op: '>=',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              0.54
            ]
          },
          {
            op: '<',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              8.0
            ]
          }
        ]
      }
    }
  })
  t.is(response.features.length, 2)
})

test('/search - filter extension - OR logical operator', async (t) => {
  let response = null

  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'or',
        args: [
          {
            op: '>',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              0.54
            ]
          },
          {
            op: '<',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              8.0
            ]
          }
        ]
      }
    }
  })
  t.is(response.features.length, 3)

  // Test case for an OpenSearch query with `filter` and `should` keys directly under a
  // `bool` key. In this case, OpenSearch uses a default `minimum_should_match` value of
  // 0, meaning that no matches in the specified `or` list are required. We test here that
  // `minimum_should_match` has been set to 1, with the effect of requiring at least one
  // of the conditions in the `or` list to be met.
  response = await t.context.api.client.post('search', {
    json: {
      collections: ['landsat-8-l1'],
      filter: {
        op: 'or',
        args: [
          {
            op: '>',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              10.0
            ]
          },
          {
            op: '<',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              0.5
            ]
          }
        ]
      }
    }
  })
  t.is(response.features.length, 0)
})

test('/search - filter extension - NOT logical operator', async (t) => {
  let response = null

  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'not',
        args: [
          {
            op: '>',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              0.54
            ]
          }
        ]
      }
    }
  })
  t.is(response.features.length, 2)

  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'not',
        args: [
          {
            op: '>',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              0.54
            ]
          },
          {
            op: '<',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              8.0
            ]
          }
        ]
      }
    }
  })
  t.is(response.features.length, 0)
})

test('/search - filter extension - handles timestamps', async (t) => {
  let response = null

  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: '>',
        args: [
          {
            property: 'datetime'
          },
          {
            timestamp: '2015-02-20T00:00:00Z'
          }
        ]
      }
    }
  })
  t.is(response.features.length, 1)

  response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: '>',
        args: [
          {
            property: 'datetime'
          },
          '2015-02-20T00:00:00Z'
        ]
      }
    }
  })
  t.is(response.features.length, 1)
})

test('/search - filter, query, and item search in single request', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      collections: ['landsat-8-l1'],
      query: {
        'view:sun_elevation': {
          gt: 20
        }
      },
      filter: {
        op: '>',
        args: [
          {
            property: 'eo:cloud_cover'
          },
          0.54
        ]
      }
    }
  })
  t.is(response.features.length, 1)
})

test('/search - filter extension - with top level field filtering', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'and',
        args: [
          {
            op: '=',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              0.54
            ]
          },
          {
            op: '=',
            args: [{ property: 'collection' }, 'collection2']
          }
        ]
      }
    }
  })
  t.is(response.features.length, 1)
})

test('/search - filter extension - failure with incorrect filter-lang', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      'filter-lang': 'not-cql2-json',
      filter: {
        op: '>',
        args: [
          {
            property: 'eo:cloud_cover'
          },
          0.54
        ]
      }
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*filter-lang must be "cql2-json".*/)
})

test('/search - filter extension - failure with incorrect filter-crs', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      'filter-crs': 'not-crs84-url',
      filter: {
        op: '>',
        args: [
          {
            property: 'eo:cloud_cover'
          },
          0.54
        ]
      }
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*filter-crs must be "http:\/\/www.opengis.net\/def\/crs\/OGC\/1.3\/CRS84".*/)
})

test('/search - filter extension - failure with non-array operand for IN', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'in',
        args: [
          {
            property: 'eo:cloud_cover'
          },
          1
        ]
      }
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*Operand for 'in' must be a non-empty array*/)
})

test('/search - filter extension - failure with array containing object for IN', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'in',
        args: [
          {
            property: 'eo:cloud_cover'
          },
          [
            {
              x: 1
            }
          ]
        ]
      }
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*Operand for 'in' must contain only string, number, or boolean types*/)
})

test('/search - filter extension - IN with string[]', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'in',
        args: [{ property: 'collection' }, ['collection2']]
      }
    }
  })
  t.is(response.features.length, 1)
})

test('/search - filter extension - IN with string[] - no matches', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'in',
        args: [{ property: 'collection' }, ['non-existent-collection']]
      }
    }
  })
  t.is(response.features.length, 0)
})

test('/search - filter extension - IN with number[]', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'in',
        args: [{ property: 'eo:cloud_cover' }, [0.54, 0.4, 0.1]]
      }
    }
  })
  t.is(response.features.length, 2)
})

test('/search - filter extension - IN with number[] - no matches', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'in',
        args: [{ property: 'eo:cloud_cover' }, [3.14]]
      }
    }
  })
  t.is(response.features.length, 0)
})

test('/search - filter extension - IN with datetime[]', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'in',
        args: [{ property: 'datetime' }, ['2015-02-19T15:06:12.565047+00:00', '2019-02-19T15:06:12.565047Z']]
      }
    }
  })
  t.is(response.features.length, 2)
})

test('/search - filter extension - IN with datetime[] - no matches', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'in',
        args: [{ property: 'datetime' }, ['1999-02-19T15:06:12.565047+00:00']]
      }
    }
  })
  t.is(response.features.length, 0)
})

test('/search - filter extension - IN with boolean[]', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'in',
        args: [{ property: 'boolean_property' }, [true]]
      }
    }
  })
  t.is(response.features.length, 1)
})

test('/search - filter extension - IN with boolean[] - no matches', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'in',
        args: [{ property: 'boolean_property' }, [false]]
      }
    }
  })
  t.is(response.features.length, 0)
})

test('/search - filter extension - BETWEEN', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'between',
        args: [{ property: 'eo:cloud_cover' }, 0.25, 0.75]
      }
    }
  })
  t.is(response.features.length, 2)
})

test('/search - filter extension - BETWEEN - no matches', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'between',
        args: [{ property: 'eo:cloud_cover' }, 1, 2]
      }
    }
  })
  t.is(response.features.length, 0)
})

test('/search - filter extension - BETWEEN - failure for not enough args ', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'between',
        args: [{ property: 'eo:cloud_cover' }, 1] // should be 2 operands
      }
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*Two operands must be provided for the 'between' operator*/)
})

test('/search - filter extension - BETWEEN - failure for non-number args', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'between',
        args: [{ property: 'eo:cloud_cover' }, 'a', 'b']
      }
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    /.*Operands for \'between\' must be numbers*/)
})

test('/search - filter extension - BETWEEN - failure for number args reversed', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      filter: {
        op: 'between',
        args: [{ property: 'eo:cloud_cover' }, 1, 0]
      }
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    // eslint-disable-next-line max-len
    /.*For the 'between' operator, the first operand must be less than or equal to the second operand*/)
})

test('/search - filter extension - s_intersects - no matches for bbox', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 's_intersects',
        args: [{ property: 'geometry' }, { bbox: [-1, -1, 0, 0] }]
      }
    }
  })
  t.is(response.features.length, 0)
})

test('/search - filter extension - s_intersects - no matches for polygon', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 's_intersects',
        args: [{ property: 'geometry' }, JSON.parse(noIntersectsGeometry)]
      }
    }
  })
  t.is(response.features.length, 0)
})

test('/search - filter extension - s_intersects - matches for polygon', async (t) => {
  const response = await t.context.api.client.post('search', {
    json: {
      filter: {
        op: 's_intersects',
        args: [{ property: 'geometry' }, JSON.parse(intersectsGeometry)]
      }
    }
  })
  t.is(response.features.length, 3)
})

test('/search - filter extension - s_intersects - failure for not bbox or geometry', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      filter: {
        op: 's_intersects',
        args: [{ property: 'geometry' }, { not_bbox: 'foo' }]
      }
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    // eslint-disable-next-line max-len
    /.*Operand for 's_intersects' must be a bbox literal or GeoJSON geometry*/)
})

test('/search - filter extension - s_intersects - non-existent geometry type', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
    json: {
      filter: {
        op: 's_intersects',
        args: [{ property: 'geometry' }, { type: 'notPolygon', coordinates: [] }]
      }
    }
  }))
  t.is(error.response.statusCode, 400)
  t.is(error.response.body.code, 'BadRequest')
  t.regex(error.response.body.description,
    // eslint-disable-next-line max-len
    /.*Operand for 's_intersects' must be a GeoJSON geometry: type was 'notPolygon'*/)
})

test('POST /search with collection restriction returns filtered collections', async (t) => {
  process.env['ENABLE_COLLECTIONS_AUTHX'] = 'true'

  const fixtureFiles = [
    'collection.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await processMessages(items)
  await refreshIndices()

  const collectionId = 'landsat-8-l1'
  const urlpath = 'search'

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: { } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: {
          _collections: []
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: {
          _collections: [collectionId]
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 2)
  }

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: {
          _collections: [collectionId, 'foo', 'bar']
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 2)
  }
  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: {
          _collections: ['not-a-collection']
        }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }
})

test('POST /search with filter restriction returns filtered results', async (t) => {
  process.env['ENABLE_FILTER_AUTHX'] = 'true'

  const fixtureFiles = [
    'collection.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await processMessages(items)
  await refreshIndices()

  const urlpath = 'search'

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: { } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 3)
  }

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: {
          _filter: null
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 3)
  }

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: {
          _filter: {
            op: '=',
            args: [
              { property: 'id' }, 'foobar'
            ]
          }
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: {
          _filter: {
            op: '<>',
            args: [
              { property: 'id' }, 'LC80100102015050LGN00'
            ]
          }
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 2)
  }

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: {
          _filter: {
            op: '=',
            args: [
              { property: 'landsat:scene_id' }, 'LC80100102015050LGN00'
            ]
          }
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 1)
  }

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: {
          _filter: {
            op: '=',
            args: [
              { property: 'landsat:scene_id' }, 'foo'
            ]
          }
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: {
          _filter: {
            op: '=',
            args: [
              { property: 'id' }, 'LC80100102015050LGN00'
            ]
          },
          filter: {
            op: '=',
            args: [
              { property: 'id' }, 'LC80100102015082LGN00'
            ]
          }
        }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        json: {
          _filter: {
            op: '=',
            args: [
              { property: 'id' }, 'LC80100102015050LGN00'
            ]
          },
          filter: {
            op: '<>',
            args: [
              { property: 'id' }, 'LC80100102015082LGN00'
            ]
          }
        }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 1)
  }

  {
    const r = await t.context.api.client.post(urlpath,
      { resolveBodyOnly: false,
        headers: { 'stac-filter-authx': JSON.stringify({
          op: '=',
          args: [
            { property: 'landsat:scene_id' }, 'LC80100102015050LGN00'
          ]
        }) },
        json: {} })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 1)
  }
})

test('/search - context extension - no context when default', async (t) => {
  const response = await t.context.api.client.post('search', { json: { } })
  t.is(response.type, 'FeatureCollection')
  t.is(response.numberMatched, 3)
  t.is(response.numberReturned, 3)

  t.falsy(response.context)
})

test('/search - context extension - context added when enabled', async (t) => {
  process.env['ENABLE_CONTEXT_EXTENSION'] = 'true'
  const response = await t.context.api.client.post('search', { json: { } })
  t.is(response.type, 'FeatureCollection')
  t.is(response.numberMatched, 3)
  t.is(response.numberReturned, 3)

  t.truthy(response.context)
  t.is(response.context.matched, 3)
  t.is(response.context.returned, 3)
  t.is(response.context.limit, 10)
})

test('/search invalid bbox throws error', async (t) => {
  // test invalid longitude
  {
    const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
      json: {
        bbox: [-190, -90, 180, 90]
      }
    }))
    t.is(error.response.statusCode, 400)
    t.is(error.response.body.code, 'BadRequest')
    t.regex(
      error.response.body.description,
      // eslint-disable-next-line max-len
      /Invalid \[lon, lat, lon, lat, z, z\] bbox\. {2}Longitudes must be between -180\/180, latitudes must be between {1}-90\/90, extent should not exceed \[-180, -90, 180, 90\]/
    )
  }

  // test invalid latitude
  {
    const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
      json: {
        bbox: [-110, -100, 180, 90]
      }
    }))
    t.is(error.response.statusCode, 400)
    t.is(error.response.body.code, 'BadRequest')
    t.regex(
      error.response.body.description,
      // eslint-disable-next-line max-len
      /Invalid \[lon, lat, lon, lat, z, z\] bbox\. {2}Longitudes must be between -180\/180, latitudes must be between {1}-90\/90, extent should not exceed \[-180, -90, 180, 90\]/
    )
  }

  // test 6 coords with invalid values
  {
    const error = await t.throwsAsync(async () => t.context.api.client.post('search', {
      json: {
        bbox: [-190, -90, 180, 100, 10, 10]
      }
    }))
    t.is(error.response.statusCode, 400)
    t.is(error.response.body.code, 'BadRequest')
    t.regex(
      error.response.body.description,
      // eslint-disable-next-line max-len
      /Invalid \[lon, lat, lon, lat, z, z\] bbox\. {2}Longitudes must be between -180\/180, latitudes must be between {1}-90\/90, extent should not exceed \[-180, -90, 180, 90\]/
    )
  }
})

test('POST /search with fields extension generates links correctly when', async (t) => {
  {
    const response = await t.context.api.client.post(
      'search',
      {
        resolveBodyOnly: false,
        json: {
          collections: ['landsat-8-l1'],
          limit: 1,
          fields: { exclude: ['assets', 'bbox', 'stac_version', 'id', 'collection'] }
        } }
    )
    t.is(response.statusCode, 200)
    t.is(response.body.features.length, 1)
    // console.log(response.body.features[0].links)

    const selfLink = response.body.features[0].links.find((l) => l.rel === 'self')
    const selfPath = new URL(selfLink.href).pathname
    // console.log(response.body.features[0].links[0])
    t.is(selfPath, '/collections/landsat-8-l1/items/LC80100102015082LGN00')

    const parentLink = response.body.features[0].links.find((l) => l.rel === 'parent')
    const parentPath = new URL(parentLink.href).pathname
    t.is(parentPath, '/collections/landsat-8-l1')

    const collectionLink = response.body.features[0].links.find((l) => l.rel === 'collection')
    const collectionPath = new URL(collectionLink.href).pathname
    t.is(collectionPath, '/collections/landsat-8-l1')
  }
  {
    const response = await t.context.api.client.post(
      'search',
      {
        resolveBodyOnly: false,
        json: {
          collections: ['landsat-8-l1'],
          limit: 1,
          fields: { exclude: ['assets', 'bbox', 'stac_version'] }
        } }
    )
    t.is(response.statusCode, 200)
    t.is(response.body.features.length, 1)
    // console.log(response.body.features[0].links)

    const selfLink = response.body.features[0].links.find((l) => l.rel === 'self')
    const selfPath = new URL(selfLink.href).pathname
    // console.log(response.body.features[0].links[0])
    t.is(selfPath, '/collections/landsat-8-l1/items/LC80100102015082LGN00')

    const parentLink = response.body.features[0].links.find((l) => l.rel === 'parent')
    const parentPath = new URL(parentLink.href).pathname
    t.is(parentPath, '/collections/landsat-8-l1')

    const collectionLink = response.body.features[0].links.find((l) => l.rel === 'collection')
    const collectionPath = new URL(collectionLink.href).pathname
    t.is(collectionPath, '/collections/landsat-8-l1')
  }
})
