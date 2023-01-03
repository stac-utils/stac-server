import test, { before, after } from 'ava'
import { deleteAllIndices } from '../helpers/database.js'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
import { setup } from '../helpers/system-tests.js'

before(async (t) => {
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
    item
  })
})

after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('PUT /collections/:collectionId/items/:itemId', async (t) => {
  const { collectionId, itemId } = t.context

  const item = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`
  )

  item.properties.foo = 'bar'

  const putResponse = await t.context.api.client.put(
    `collections/${collectionId}/items/${itemId}`,
    { json: item, resolveBodyOnly: false }
  )

  t.is(putResponse.statusCode, 204)
  t.falsy(putResponse.headers['content-type'])
  t.is(putResponse.body, '')

  // ES needs a second to process the put request
  // eslint-disable-next-line no-promise-executor-return
  await new Promise((r) => setTimeout(r, 1000))

  const getResponse = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`,
    { resolveBodyOnly: false }
  )

  t.is(getResponse.body.properties.foo, 'bar')
})

test('PUT /collections/:collectionId/items/:itemId for a non-existent collection or id returns 404"', async (t) => {
  const { collectionId } = t.context

  t.is((await t.context.api.client.put(
    `collections/${collectionId}/items/DOES_NOT_EXIST`,
    { json: {}, resolveBodyOnly: false, throwHttpErrors: false }
  )).statusCode, 404)

  t.is((await t.context.api.client.put(
    'collections/DOES_NOT_EXIST/items/DOES_NOT_EXIST',
    { json: {}, resolveBodyOnly: false, throwHttpErrors: false }
  )).statusCode, 404)
})

test('PUT /collections/:collectionId/items with mismatched collection id', async (t) => {
  const { collectionId, itemId } = t.context

  const item = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`
  )

  item.collection = 'DOES_NOT_EXIST'

  const badResponse = await t.context.api.client.put(
    `collections/${collectionId}/items/${itemId}`,
    { throwHttpErrors: false, resolveBodyOnly: false, json: item }
  )

  t.is(badResponse.statusCode, 400)
})

test('PUT /collections/:collectionId/items with mismatched id', async (t) => {
  const { collectionId, itemId } = t.context

  const item = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`
  )

  item.id = 'DOES_NOT_EXIST'

  const badResponse = await t.context.api.client.put(
    `collections/${collectionId}/items/${itemId}`,
    { throwHttpErrors: false, resolveBodyOnly: false, json: item }
  )

  t.is(badResponse.statusCode, 400)
})

test('PUT /collections/:collectionId/items with missing collection id populate it', async (t) => {
  const { collectionId, itemId } = t.context

  const item = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`
  )

  delete item.collection

  await t.context.api.client.put(
    `collections/${collectionId}/items/${itemId}`,
    { json: item }
  )
  // ES needs a second to process the put request
  // eslint-disable-next-line no-promise-executor-return
  await new Promise((r) => setTimeout(r, 1000))

  const getResponse = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`,
    { resolveBodyOnly: false }
  )

  t.is(getResponse.body.collection, collectionId)
})
