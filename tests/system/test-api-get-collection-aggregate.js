// @ts-nocheck

import test from 'ava'
import { randomId } from '../helpers/utils.js'
import { setup, loadJson } from '../helpers/system-tests.js'
import { deleteAllIndices, refreshIndices } from '../helpers/database.js'
import { ingestItems } from '../../src/lib/ingest.js'

const proto = randomId()
const host = randomId()

const fixtureCollections = [
  'collection.json',
  'collection-s1.json',
]
const fixtureItems = [
  'LC80100102015050LGN00.json',
  'LC80100102015082LGN00.json',
  'item-s1-1.json',
  'item-s1-2.json'
]

test.before(async (t) => {
  await deleteAllIndices()
  t.context = await setup()
  await ingestItems(await Promise.all(fixtureCollections.map((x) => loadJson(x))))
  await refreshIndices()
  await ingestItems(await Promise.all(fixtureItems.map((x) => loadJson(x))))
  await refreshIndices()
})

test('GET /collections/{collectionId}/aggregate with no aggregations param', async (t) => {
  const response = await t.context.api.client.get(
    'collections/landsat-8-l1/aggregate',
    {
      resolveBodyOnly: false,
      headers: {
        'X-Forwarded-Proto': proto,
        'X-Forwarded-Host': host
      }
    }
  )

  t.is(response.statusCode, 200)
  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
  t.deepEqual(response.body.aggregations, [])
  t.deepEqual(response.body.links, [
    {
      rel: 'self',
      type: 'application/json',
      href: `${proto}://${host}/collections/landsat-8-l1/aggregate`
    },
    {
      rel: 'root',
      type: 'application/json',
      href: `${proto}://${host}`
    },
    {
      href: `${proto}://${host}/collections/landsat-8-l1`,
      rel: 'collection',
      type: 'application/json',
    },
  ])
})

test('GET /collections/{collectionId}/aggregate with aggregations param', async (t) => {
  const response = await t.context.api.client.get(
    'collections/sentinel-1-grd/aggregate',
    {
      searchParams: new URLSearchParams(
        { aggregations:
          ['total_count', 'datetime_frequency', 'centroid_geohex_grid_frequency'] }
      ),
      resolveBodyOnly: false,
      headers: {
        'X-Forwarded-Proto': proto,
        'X-Forwarded-Host': host
      }
    }
  )

  t.is(response.statusCode, 200)
  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
  t.deepEqual(response.body.aggregations, [{
    name: 'total_count',
    data_type: 'integer',
    value: 2
  },
  {
    buckets: [{
      data_type: 'string',
      frequency: 2,
      key: '80cdfffffffffff',
    }],
    data_type: 'frequency_distribution',
    name: 'centroid_geohex_grid_frequency',
    overflow: 0,
  },
  {
    name: 'datetime_frequency',
    data_type: 'frequency_distribution',
    buckets: [{
      data_type: 'datetime',
      frequency: 2,
      key: '2023-04-01T00:00:00.000Z',
    }],
    overflow: 0
  }])

  t.deepEqual(response.body.links, [
    {
      rel: 'self',
      type: 'application/json',
      href: `${proto}://${host}/collections/sentinel-1-grd/aggregate`
    },
    {
      rel: 'root',
      type: 'application/json',
      href: `${proto}://${host}`
    },
    {
      rel: 'collection',
      type: 'application/json',
      href: `${proto}://${host}/collections/sentinel-1-grd`
    },
  ])
})

test('GET /collections/{collectionId}/aggregate with non-existant aggregation', async (t) => {
  const response = await t.context.api.client.get(
    'collections/sentinel-1-grd/aggregate',
    {
      throwHttpErrors: false,
      searchParams: new URLSearchParams({ aggregations: ['foo'] }),
      resolveBodyOnly: false,
      headers: {
        'X-Forwarded-Proto': proto,
        'X-Forwarded-Host': host
      }
    }
  )

  t.is(response.statusCode, 400)
  t.deepEqual(response.body, {
    code: 'BadRequest',
    description: 'Aggregation foo not supported by collection sentinel-1-grd'
  })
})

test('GET /aggregate with aggregation not supported by this collection', async (t) => {
  const response = await t.context.api.client.get(
    'collections/sentinel-1-grd/aggregate',
    {
      throwHttpErrors: false,
      searchParams: new URLSearchParams({ aggregations: ['grid_code_frequency'] }),
      resolveBodyOnly: false,
      headers: {
        'X-Forwarded-Proto': proto,
        'X-Forwarded-Host': host
      }
    }
  )

  t.is(response.statusCode, 400)
  t.deepEqual(response.body, {
    code: 'BadRequest',
    description: 'Aggregation grid_code_frequency not supported by collection sentinel-1-grd'
  })
})
