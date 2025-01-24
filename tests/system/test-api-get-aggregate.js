// @ts-nocheck

import test from 'ava'
import { randomId } from '../helpers/utils.js'
import { setup, loadJson } from '../helpers/system-tests.js'
import { deleteAllIndices, refreshIndices } from '../helpers/database.js'
import { ingestItems } from '../../src/lib/ingest.js'

test.before(async (t) => {
  await deleteAllIndices()
  t.context = await setup()
})

const proto = randomId()
const host = randomId()

test('GET /aggregate with no aggregations param', async (t) => {
  const response = await t.context.api.client.get(
    'aggregate',
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
      href: `${proto}://${host}/aggregate`
    },
    {
      rel: 'root',
      type: 'application/json',
      href: `${proto}://${host}`
    }
  ])
})

test('GET /aggregate with aggregations param', async (t) => {
  const fixtureFiles = [
    'collection.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await ingestItems(items)
  await refreshIndices()

  const response = await t.context.api.client.get(
    'aggregate',
    {
      searchParams: new URLSearchParams(
        { aggregations:
          ['total_count', 'datetime_frequency', 'grid_geohex_frequency'] }
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
    buckets: [],
    data_type: 'frequency_distribution',
    name: 'grid_geohex_frequency',
    overflow: 0,
  },
  {
    name: 'datetime_frequency',
    data_type: 'frequency_distribution',
    buckets: [{
      data_type: 'datetime',
      frequency: 1,
      key: '2015-02-01T00:00:00.000Z',
    },
    {
      data_type: 'datetime',
      frequency: 1,
      key: '2015-03-01T00:00:00.000Z',
    }],
    overflow: 0
  }])
  t.deepEqual(response.body.links, [
    {
      rel: 'self',
      type: 'application/json',
      href: `${proto}://${host}/aggregate`
    },
    {
      rel: 'root',
      type: 'application/json',
      href: `${proto}://${host}`
    }
  ])
})

test('GET /aggregate with non-existant aggregation', async (t) => {
  const response = await t.context.api.client.get(
    'aggregate',
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
    description: 'Aggregation foo not supported at catalog level'
  })
})

test('GET /aggregate with geoaggregations', async (t) => {
  const fixtureFiles = [
    'collection-s1.json',
    'item-s1-1.json', // has proj:centroid
    'item-s1-2.json', // has proj:centroid
    'collection.json',
    'LC80100102015050LGN00.json', // no proj:centroid
    'LC80100102015082LGN00.json', // no proj:centroid
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await ingestItems(items)
  await refreshIndices()

  const response = await t.context.api.client.get(
    'aggregate',
    {
      searchParams: new URLSearchParams(
        { aggregations:
          [
            'total_count',
            'grid_geohex_frequency',
            'grid_geotile_frequency',
            'grid_geohash_frequency',
            'centroid_geohash_grid_frequency',
            'centroid_geohex_grid_frequency',
            'centroid_geotile_grid_frequency',
            'geometry_geohash_grid_frequency',
            // 'geometry_geohex_grid_frequency'
            'geometry_geotile_grid_frequency',
          ] }
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
  t.deepEqual(new Set(response.body.aggregations), new Set([{
    name: 'total_count',
    data_type: 'integer',
    value: 4
  },
  {
    buckets: [{
      data_type: 'string',
      frequency: 2,
      key: 'j',
    }],
    data_type: 'frequency_distribution',
    name: 'grid_geohash_frequency',
    overflow: 0,
  },
  {
    buckets: [{
      data_type: 'string',
      frequency: 2,
      key: '80cdfffffffffff',
    }],
    data_type: 'frequency_distribution',
    name: 'grid_geohex_frequency',
    overflow: 0,
  },

  {
    buckets: [{
      data_type: 'string',
      frequency: 2,
      key: '0/0/0',
    }],
    data_type: 'frequency_distribution',
    name: 'grid_geotile_frequency',
    overflow: 0,
  },
  {
    buckets: [
      {
        data_type: 'string',
        frequency: 2,
        key: 'j',
      },
    ],
    data_type: 'frequency_distribution',
    name: 'centroid_geohash_grid_frequency',
    overflow: 0,
  },
  {
    buckets: [
      {
        data_type: 'string',
        frequency: 2,
        key: '80cdfffffffffff',
      },
    ],
    data_type: 'frequency_distribution',
    name: 'centroid_geohex_grid_frequency',
    overflow: 0,
  },
  {
    buckets: [
      {
        data_type: 'string',
        frequency: 2,
        key: '0/0/0',
      },
    ],
    data_type: 'frequency_distribution',
    name: 'centroid_geotile_grid_frequency',
    overflow: 0,
  },
  {
    buckets: [
      {
        data_type: 'string',
        frequency: 2,
        key: 'j',
      },
      {
        data_type: 'string',
        frequency: 2,
        key: 'f',
      },
    ],
    data_type: 'frequency_distribution',
    name: 'geometry_geohash_grid_frequency',
    overflow: 0,
  },
  {
    buckets: [
      {
        data_type: 'string',
        frequency: 4,
        key: '0/0/0',
      },
    ],
    data_type: 'frequency_distribution',
    name: 'geometry_geotile_grid_frequency',
    overflow: 0,
  },

  ]))

  t.deepEqual(response.body.links, [
    {
      rel: 'self',
      type: 'application/json',
      href: `${proto}://${host}/aggregate`
    },
    {
      rel: 'root',
      type: 'application/json',
      href: `${proto}://${host}`
    }
  ])
})

test('GET /aggregate with geoaggregations with precision', async (t) => {
  const fixtureFiles = [
    'collection-s1.json',
    'item-s1-1.json', // has proj:centroid
    'item-s1-2.json', // has proj:centroid
    'collection.json',
    'LC80100102015050LGN00.json', // no proj:centroid
    'LC80100102015082LGN00.json', // no proj:centroid
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await ingestItems(items)
  await refreshIndices()

  const response = await t.context.api.client.get(
    'aggregate',
    {
      searchParams: new URLSearchParams(
        {
          aggregations:
          [
            'total_count',
            'grid_geohex_frequency',
            'grid_geotile_frequency',
            'grid_geohash_frequency'],
          grid_geohex_frequency_precision: 10,
          grid_geotile_frequency_precision: 20,
          grid_geohash_frequency_precision: 8
        }
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
  t.deepEqual(new Set(response.body.aggregations), new Set([{
    name: 'total_count',
    data_type: 'integer',
    value: 4
  },
  {
    buckets: [
      {
        data_type: 'string',
        frequency: 1,
        key: 'jxw7rxty',
      },
      {
        data_type: 'string',
        frequency: 1,
        key: 'jxr4dd07',
      },
    ],
    data_type: 'frequency_distribution',
    name: 'grid_geohash_frequency',
    overflow: 0,
  },
  {
    buckets: [
      {
        data_type: 'string',
        frequency: 1,
        key: '8acd5d4d8a0ffff',
      },
      {
        data_type: 'string',
        frequency: 1,
        key: '8acd5b701887fff',
      },
    ],
    data_type: 'frequency_distribution',
    name: 'grid_geohex_frequency',
    overflow: 0,
  },
  {
    buckets: [{
      data_type: 'string',
      frequency: 1,
      key: '20/749889/687442',
    },
    {
      data_type: 'string',
      frequency: 1,
      key: '20/747479/680615',
    }],
    data_type: 'frequency_distribution',
    name: 'grid_geotile_frequency',
    overflow: 0,
  },
  ]))

  t.deepEqual(response.body.links, [
    {
      rel: 'self',
      type: 'application/json',
      href: `${proto}://${host}/aggregate`
    },
    {
      rel: 'root',
      type: 'application/json',
      href: `${proto}://${host}`
    }
  ])
})

test('GET /aggregate with geoaggregations with invalid precision', async (t) => {
  const response = await t.context.api.client.get(
    'aggregate',
    {
      searchParams: new URLSearchParams(
        {
          aggregations: ['grid_geohex_frequency'],
          grid_geohex_frequency_precision: 20,
        }
      ),
      throwHttpErrors: false,
      resolveBodyOnly: false,
    }
  )

  t.is(response.statusCode, 400)
  t.deepEqual(response.body, {
    code: 'BadRequest',
    description: 'Invalid precision value for grid_geohex_frequency_precision, must be a number between 0 and 15 inclusive'
  })
})

test('GET /aggregate with aggregations and query params', async (t) => {
  const fixtureFiles = [
    'collection.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await ingestItems(items)
  await refreshIndices()

  const response = await t.context.api.client.get(
    'aggregate',
    {
      searchParams: new URLSearchParams(
        { aggregations: ['total_count'],
          query: JSON.stringify({
            'eo:cloud_cover': {
              gt: 0.54
            }
          })
        }
      ),
      resolveBodyOnly: false,
      headers: {
        'X-Forwarded-Proto': proto,
        'X-Forwarded-Host': host
      }
    }
  )

  t.is(response.statusCode, 200)
  t.deepEqual(response.body.aggregations, [{
    name: 'total_count',
    data_type: 'integer',
    value: 1
  }])
})

test('GET /aggregate with aggregations and filter params', async (t) => {
  const fixtureFiles = [
    'collection.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await ingestItems(items)
  await refreshIndices()

  const response = await t.context.api.client.get(
    'aggregate',
    {
      searchParams: new URLSearchParams(
        { aggregations: ['total_count'],
          filter: JSON.stringify({
            op: '>',
            args: [
              {
                property: 'eo:cloud_cover'
              },
              0.54
            ]
          })
        }
      ),
      resolveBodyOnly: false,
      headers: {
        'X-Forwarded-Proto': proto,
        'X-Forwarded-Host': host
      }
    }
  )

  t.is(response.statusCode, 200)
  t.deepEqual(response.body.aggregations, [{
    name: 'total_count',
    data_type: 'integer',
    value: 1
  }])
})
