// @ts-nocheck

import test from 'ava'
import { deleteAllIndices } from '../helpers/database.js'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
import { setup } from '../helpers/system-tests.js'

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await setup()

  t.context = standUpResult

  t.context.collectionId = randomId('collection')
})

test.beforeEach(async (_) => {
  delete process.env['ENABLE_COLLECTIONS_AUTHX']
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET /collection/:collectionId/aggregations for non-existent collection returns Not Found', async (t) => {
  const response = await t.context.api.client.get(
    'collections/DOES_NOT_EXIST/aggregations',
    { resolveBodyOnly: false, throwHttpErrors: false }
  )

  t.is(response.statusCode, 404)
})

const links = (proto, host, collectionId) => [
  {
    rel: 'root',
    type: 'application/json',
    href: `${proto}://${host}`
  },
  {
    rel: 'self',
    type: 'application/json',
    href: `${proto}://${host}/collections/${collectionId}/aggregations`
  },
  {
    rel: 'collection',
    type: 'application/json',
    href: `${proto}://${host}/collections/${collectionId}`
  }
]

test('GET /collections/:collectionId/aggregations returns aggregations for collection with aggregations',
  async (t) => {
    const collection = await loadFixture(
      'stac/collection-with-aggregations.json',
      { id: t.context.collectionId }
    )

    await ingestItem({
      ingestQueueUrl: t.context.ingestQueueUrl,
      ingestTopicArn: t.context.ingestTopicArn,
      item: collection
    })

    const { collectionId } = t.context
    const proto = randomId()
    const host = randomId()
    const response = await t.context.api.client.get(
      `collections/${collectionId}/aggregations`,
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
    t.deepEqual(response.body.aggregations, collection.aggregations)
    t.deepEqual(response.body.links, links(proto, host, collectionId))
  })

test('GET /collections/:collectionId/aggregations returns default aggregations for collection without aggregations',
  async (t) => {
    const collection = await loadFixture(
      'stac/collection-without-aggregations.json',
      { id: t.context.collectionId }
    )

    await ingestItem({
      ingestQueueUrl: t.context.ingestQueueUrl,
      ingestTopicArn: t.context.ingestTopicArn,
      item: collection
    })

    const { collectionId } = t.context
    const proto = randomId()
    const host = randomId()
    const response = await t.context.api.client.get(
      `collections/${collectionId}/aggregations`,
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
    t.deepEqual(response.body.aggregations, [
      {
        name: 'total_count',
        data_type: 'integer'
      },
      {
        name: 'datetime_max',
        data_type: 'datetime'
      },
      {
        name: 'datetime_min',
        data_type: 'datetime'
      },
      {
        name: 'datetime_frequency',
        data_type: 'frequency_distribution',
        frequency_distribution_data_type: 'datetime'
      },
    ])
    t.deepEqual(response.body.links, links(proto, host, collectionId))
  })

test('GET /collections/:collectionId/aggregations with restriction returns filtered collections', async (t) => {
  process.env['ENABLE_COLLECTIONS_AUTHX'] = 'true'

  const { collectionId } = t.context

  const path = `collections/${collectionId}/aggregations`

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false, throwHttpErrors: false })).statusCode, 404)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      throwHttpErrors: false,
      searchParams: { _collections: '' }
    })).statusCode, 404)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      searchParams: { _collections: '*' }
    })).statusCode, 200)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      searchParams: { _collections: `${collectionId},foo,bar` }
    })).statusCode, 200)

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false,
      throwHttpErrors: false,
      searchParams: { _collections: 'not-a-collection' }
    })).statusCode, 404)
})
