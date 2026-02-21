// @ts-nocheck

import test from 'ava'
import { deleteAllIndices } from '../helpers/database.js'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
import { setup } from '../helpers/system-tests.js'

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await setup('false')

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
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('POST /collections/:collectionId/items searches if ENABLE_TRANSACTIONS_EXTENSION is false', async (t) => {
  const { collectionId } = t.context
  t.context.itemId = randomId('item')
  const item = await loadFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: t.context.itemId,
      collection: t.context.collectionId
    }
  )
  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: item
  })
  const searchPayload = {
    datetime: '2015-03-22T00:00:00Z/2015-03-24T00:00:00Z'
  }

  const response = await t.context.api.client.post(
    `collections/${collectionId}/items`,
    { resolveBodyOnly: false, json: searchPayload }
  )

  t.is(response.statusCode, 200)
  t.is(response.body.features.length, 1)
  t.is(response.body.features[0].id, t.context.itemId)
})

test('POST /collections/:collectionId/items fails with transaction payload', async (t) => {
  const { collectionId } = t.context

  t.context.itemId = randomId('item')

  const item = await loadFixture(
    'stac/LC80100102015050LGN00.json',
    {
      id: t.context.itemId,
      collection: t.context.collectionId
    }
  )

  delete item.collection

  const response = await t.context.api.client.post(
    `collections/${collectionId}/items`,
    { throwHttpErrors: false, resolveBodyOnly: false, json: item }
  )

  t.is(response.statusCode, 400)
  t.regex(response.body.message, /Payload is not a valid search request\..+/)
})
