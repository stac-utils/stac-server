import test, { before, after } from 'ava'
import { deleteAllIndices } from '../helpers/database'
import { ingestItem } from '../helpers/ingest'
import { randomId, loadFixture } from '../helpers/utils'
import { setup } from '../helpers/system-tests'

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

test('GET /collections/:collectionId/items/:itemId', async (t) => {
  const { collectionId, itemId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`,
    { resolveBodyOnly: false }
  )

  t.is(response.statusCode, 200)
  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
  t.is(response.body.type, 'Feature')
  t.is(response.body.id, itemId)
  t.is(response.body.collection, collectionId)
})

test('GET /collections/:collectionId/items/:itemId for a non-existent id returns Not Found"', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items/DOES_NOT_EXIST`,
    { resolveBodyOnly: false, throwHttpErrors: false }
  )

  t.is(response.statusCode, 404)
})
