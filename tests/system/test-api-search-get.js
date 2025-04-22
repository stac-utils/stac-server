// @ts-nocheck

import test from 'ava'
import got from 'got' // eslint-disable-line import/no-unresolved
import { deleteAllIndices, refreshIndices } from '../helpers/database.js'
import { randomId } from '../helpers/utils.js'
import { ingestItems } from '../../src/lib/ingest.js'
import { setup, loadJson } from '../helpers/system-tests.js'

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await setup()

  t.context = standUpResult
})

test.beforeEach(async (_) => {
  delete process.env['ENABLE_COLLECTIONS_AUTHX']
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
  await ingestItems(items)
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
      response.features[1].properties.datetime,
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
  await ingestItems(items)
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
      response.features[0].properties.datetime,
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
  await ingestItems(items)
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
  await ingestItems(items)
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
