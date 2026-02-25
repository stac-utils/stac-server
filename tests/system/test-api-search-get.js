// @ts-nocheck

import test from 'ava'
import got from 'got' // eslint-disable-line import/no-unresolved
import { deleteAllIndices, refreshIndices } from '../helpers/database.js'
import { randomId } from '../helpers/utils.js'
import { processMessages } from '../../src/lib/ingest.js'
import { setup, loadJson } from '../helpers/system-tests.js'

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await setup()

  t.context = standUpResult
})

test.beforeEach(async (_) => {
  delete process.env['ENABLE_COLLECTIONS_AUTHX']
  delete process.env['ENABLE_FILTER_AUTHX']
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET /search returns an empty list of results for a collection that does not exist', async (t) => {
  const collectionId = randomId('collection')
  const searchParams = new URLSearchParams({ collections: [collectionId] })

  const response = await t.context.api.client.get('search', { searchParams })

  t.true(Array.isArray(response.features))
  t.is(response.features.length, 0)
})

test('GET /search has a content type of "application/geo+json; charset=utf-8', async (t) => {
  const response = await t.context.api.client.get('search', {
    resolveBodyOnly: false
  })

  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
})

test('/search preserve bbox in next links', async (t) => {
  const fixtureFiles = [
    'catalog.json',
    'collection.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await processMessages(items)
  await refreshIndices()

  const bbox = '-180,-90,180,90'

  const response = await t.context.api.client.get('search', {
    searchParams: new URLSearchParams({
      bbox,
      limit: 2,
    })
  })

  t.is(response.features.length, 2)
  const nextLink = response.links.find((x) => x.rel === 'next')
  const nextUrl = new URL(nextLink.href)
  t.deepEqual(nextUrl.searchParams.get('bbox'), bbox)

  t.deepEqual(nextUrl.searchParams.get('next'),
    [
      new Date(response.features[1].properties.datetime).getTime(),
      response.features[1].id,
      response.features[1].collection
    ].join(','))

  const nextResponse = await got.get(nextUrl).json()
  t.is(nextResponse.features.length, 0)
  t.falsy(nextResponse.links.find((x) => x.rel === 'next'))
})

test('/search preserve bbox and datetime in next links', async (t) => {
  const fixtureFiles = [
    'catalog.json',
    'collection.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await processMessages(items)
  await refreshIndices()

  const bbox = '-180,-90,180,90'
  const datetime = '2015-02-19T00:00:00Z/2021-02-19T00:00:00Z'
  const response = await t.context.api.client.get('search', {
    searchParams: new URLSearchParams({
      bbox,
      datetime: datetime,
      limit: 1
    })
  })

  t.is(response.features.length, 1)
  t.is(response.links.length, 2)

  const nextLink = response.links.find((x) => x.rel === 'next')
  const nextUrl = new URL(nextLink.href)
  t.deepEqual(nextUrl.searchParams.get('next'),
    [
      new Date(response.features[0].properties.datetime).getTime(),
      response.features[0].id,
      response.features[0].collection
    ].join(','))
  t.deepEqual(nextUrl.searchParams.get('bbox'), bbox)
  t.deepEqual(nextUrl.searchParams.get('datetime'), datetime)
})

test('/search filter, query, and item search in single request', async (t) => {
  const fixtureFiles = [
    'collection.json',
    'collection2.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json',
    'collection2_item.json'
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await processMessages(items)
  await refreshIndices()

  const response = await t.context.api.client.get('search', {
    searchParams: new URLSearchParams({
      collections: ['landsat-8-l1'],
      query: JSON.stringify({
        'view:sun_elevation': {
          gt: 20
        }
      }),
      filter: JSON.stringify({
        op: '>',
        args: [
          {
            property: 'eo:cloud_cover'
          },
          0.54
        ]
      })
    })
  })
  t.is(response.features.length, 1)
})

test('GET /search with restriction returns filtered collections', async (t) => {
  process.env['ENABLE_COLLECTIONS_AUTHX'] = 'true'

  const fixtureFiles = [
    'catalog.json',
    'collection.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await processMessages(items)
  await refreshIndices()

  const collectionId = 'landsat-8-l1'
  const path = 'search'

  {
    const r = await t.context.api.client.get(path,
      { resolveBodyOnly: false })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }
  {
    const r = await t.context.api.client.get(path,
      { resolveBodyOnly: false, searchParams: { _collections: '' } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }
  {
    const r = await t.context.api.client.get(path,
      { resolveBodyOnly: false,
        searchParams: { _collections: '*' }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 3)
  }

  {
    const r = await t.context.api.client.get(path,
      { resolveBodyOnly: false,
        searchParams: { _collections: `${collectionId},foo,bar` }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 2)
  }
  {
    const r = await t.context.api.client.get(path,
      { resolveBodyOnly: false,
        searchParams: { _collections: 'not-a-collection' }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }
})

test('GET /search with filter restriction returns filtered results', async (t) => {
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
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: { }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 3)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: { _filter: null }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 3)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: { _filter: JSON.stringify({
          op: '=',
          args: [
            { property: 'id' }, 'foobar'
          ]
        }) }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '<>',
            args: [
              { property: 'id' }, 'LC80100102015050LGN00'
            ]
          })
        } })
    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 2)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'landsat:scene_id' }, 'LC80100102015050LGN00'
            ]
          })
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 1)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'landsat:scene_id' }, 'foo'
            ]
          })
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'id' }, 'LC80100102015050LGN00'
            ]
          }),
          filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'id' }, 'LC80100102015082LGN00'
            ]
          })
        }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'id' }, 'LC80100102015050LGN00'
            ]
          }),
          filter: JSON.stringify({
            op: '<>',
            args: [
              { property: 'id' }, 'LC80100102015082LGN00'
            ]
          })
        }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 1)
  }

  // header
  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'landsat:scene_id' }, 'LC80100102015050LGN00'
            ]
          })
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 1)
  }

  process.env['ENABLE_FILTER_AUTHX'] = 'false'

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'landsat:scene_id' }, 'LC80100102015050LGN00'
            ]
          })
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 3)
  }
})

test('/search sort unqualified field names fails', async (t) => {
  const error = await t.throwsAsync(async () => t.context.api.client.get('search', {
    searchParams: { sortby: '-datetime' }
  }))

  t.is(error.response.statusCode, 400)
  t.truthy(error.response.body.description.includes('Hint: `sortby` requires fully qualified identifiers'))
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
