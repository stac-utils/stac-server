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

test('PATCH /collections/:collectionId/items/:itemId', async (t) => {
  const { collectionId, itemId } = t.context

  const patchResponse = await t.context.api.client.patch(
    `collections/${collectionId}/items/${itemId}`,
    { json: {
      properties: {
        foo: 'bar'
      }
    },
    resolveBodyOnly: false }
  )

  t.is(patchResponse.statusCode, 200)
  t.is(patchResponse.headers['content-type'], 'application/geo+json; charset=utf-8')
  t.is(patchResponse.body.id, itemId)
  t.is(patchResponse.body.properties.foo, 'bar')

  // ES needs a second to process the patch request
  // eslint-disable-next-line no-promise-executor-return
  await new Promise((r) => setTimeout(r, 1000))

  const getResponse = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`,
    { resolveBodyOnly: false }
  )

  t.is(getResponse.body.properties.foo, 'bar')
})

test('PATCH /collections/:collectionId/items/:itemId for a non-existent collection or id returns 404"', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.patch(
    `collections/${collectionId}/items/DOES_NOT_EXIST`,
    { json: {}, resolveBodyOnly: false, throwHttpErrors: false }
  )

  t.is(response.statusCode, 404)
})
