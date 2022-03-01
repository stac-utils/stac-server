const test = require('ava')
const { deleteAllIndices } = require('../helpers/es')
const { ingestItem } = require('../helpers/ingest')
const { randomId, loadFixture } = require('../helpers/utils')
const systemTests = require('../helpers/system-tests')

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await systemTests.setup()

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

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('DELETE /collections/:collectionId/items/:itemId', async (t) => {
  const { collectionId, itemId } = t.context

  const response = await t.context.api.client.delete(
    `collections/${collectionId}/items/${itemId}`,
    { resolveBodyOnly: false }
  )

  t.is(response.statusCode, 204)
  t.is(response.headers['content-type'], undefined)
  t.is(response.body, '')
})

test('DELETE /collections/:collectionId/items/:itemId for a non-existent id returns No Content"', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.delete(
    `collections/${collectionId}/items/DOES_NOT_EXIST`,
    { resolveBodyOnly: false, throwHttpErrors: false }
  )

  t.is(response.statusCode, 204)
  t.is(response.headers['content-type'], undefined)
  t.is(response.body, '')
})
