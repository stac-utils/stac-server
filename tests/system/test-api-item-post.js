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

test('POST /collections/:collectionId/items with ItemCollection', async (t) => {
  const item1Id = randomId('item')
  const item1 = await loadFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: item1Id,
      collection: t.context.collectionId
    }
  )
  delete item1.collection

  const item2Id = randomId('item')
  const item2 = await loadFixture(
    'stac/LC80100102015050LGN00.json',
    {
      id: item2Id,
      collection: t.context.collectionId
    }
  )
  delete item2.collection

  const itemCollection = {
    type: 'FeatureCollection',
    features: [item1, item2],
    links: []
  }

  const { collectionId } = t.context

  let response = await t.context.api.client.post(
    `collections/${collectionId}/items`,
    { json: itemCollection, resolveBodyOnly: false, responseType: 'text' }
  )

  t.is(response.statusCode, 201)
  t.is(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.is(response.body, 'Created')

  // ES needs a second to process the create request
  // eslint-disable-next-line no-promise-executor-return
  await new Promise((r) => setTimeout(r, 1000))

  let getResponse = await t.context.api.client.get(
    `collections/${collectionId}/items/${item1Id}`,
    { resolveBodyOnly: false }
  )

  t.is(getResponse.body.collection, collectionId)

  getResponse = await t.context.api.client.get(
    `collections/${collectionId}/items/${item2Id}`,
    { resolveBodyOnly: false }
  )

  t.is(getResponse.body.collection, collectionId)

  const item3Id = randomId('item')
  const item3 = item1
  item3.id = item3Id
  itemCollection.features = [item2, item3]

  response = await t.context.api.client.post(
    `collections/${collectionId}/items`,
    { json: itemCollection, resolveBodyOnly: false, throwHttpErrors: false, responseType: 'text' }
  )

  t.is(response.statusCode, 409)
  t.regex(response.body, /1 items created\. .+/)
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
