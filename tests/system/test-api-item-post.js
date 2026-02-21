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
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('POST /collections/:collectionId for a non-existent collection returns 404"', async (t) => {
  const response = await t.context.api.client.post(
    'collections/DOES_NOT_EXIST',
    { json: {}, resolveBodyOnly: false, throwHttpErrors: false }
  )

  t.is(response.statusCode, 404)
  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
  t.deepEqual(response.body, {
    code: 'NotFound',
    description: 'Not Found',
  })
})

test('POST /collections/:collectionId/items', async (t) => {
  t.context.itemId = randomId('item')

  const item = await loadFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: t.context.itemId,
      collection: t.context.collectionId
    }
  )

  delete item.collection

  const { collectionId, itemId } = t.context

  const response = await t.context.api.client.post(
    `collections/${collectionId}/items`,
    { json: item, resolveBodyOnly: false, responseType: 'text' }
  )

  t.is(response.statusCode, 201)
  t.is(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.assert(response.headers['location'].endsWith(`/collections/${collectionId}/items/${itemId}`))
  t.is(response.body, 'Created')

  // ES needs a second to process the create request
  // eslint-disable-next-line no-promise-executor-return
  await new Promise((r) => setTimeout(r, 1000))

  const getResponse = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`,
    { resolveBodyOnly: false }
  )

  t.is(getResponse.body.collection, collectionId)
})

test('POST /collections/:collectionId/items with mismatched collection id', async (t) => {
  t.context.itemId = randomId('item')

  const item = await loadFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: t.context.itemId,
      collection: t.context.collectionId
    }
  )

  const { collectionId } = t.context

  item.collection = 'DOES_NOT_EXIST'

  const badResponse = await t.context.api.client.post(
    `collections/${collectionId}/items`,
    { throwHttpErrors: false, resolveBodyOnly: false, json: item }
  )

  t.is(badResponse.statusCode, 400)
})

test('POST /collections/:collectionId/items fails with search payload', async(t) => {
  const { collectionId } = t.context
  const searchPayload = {
    datetime: '2015-03-22T00:00:00Z/2015-03-24T00:00:00Z'
  }

  const response = await t.context.api.client.post(
    `collections/${collectionId}/items`,
    { throwHttpErrors: false, resolveBodyOnly: false, json: searchPayload }
  )

  t.is(response.statusCode, 400)
  t.regex(response.body.message, /Payload is not a valid transaction request\..+/)
})
