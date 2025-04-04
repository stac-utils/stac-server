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

  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: t.context.collectionId }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: collection
  })

  t.context.itemId1 = randomId('item')

  const item1 = await loadFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: t.context.itemId1,
      collection: t.context.collectionId
    }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: item1
  })

  t.context.itemId2 = randomId('item')

  const item2 = await loadFixture(
    'stac/LC80100102015050LGN00.json',
    {
      id: t.context.itemId2,
      collection: t.context.collectionId
    }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: item2
  })
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET /collections/:collectionId/items', async (t) => {
  const { collectionId, itemId1, itemId2 } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items`,
    { resolveBodyOnly: false }
  )

  t.is(response.statusCode, 200)
  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')

  t.is(response.body.type, 'FeatureCollection')

  t.is(response.body.features.length, 2)

  t.is(response.body.features[0].id, itemId1)
  t.is(response.body.features[1].id, itemId2)
})

test('GET /collections/:collectionId/items for non-existent collection returns 404', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}_DOES_NOT_EXIST/items`,
    { resolveBodyOnly: false, throwHttpErrors: false }
  )

  t.is(response.statusCode, 404)
})

test('GET /collections/:collectionId/items with restriction returns filtered collections', async (t) => {
  const { collectionId } = t.context

  const path = `collections/${collectionId}/items`

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false })).statusCode, 200)

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
