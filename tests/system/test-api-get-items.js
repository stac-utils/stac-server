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

  const response = await t.context.api.client.get(`collections/${collectionId}/items`)

  t.is(response.type, 'FeatureCollection')

  t.is(response.features.length, 2)

  t.is(response.features[0].id, itemId1)
  t.is(response.features[1].id, itemId2)
})

test('GET /collections/:collectionId/items has a content type of "application/geo+json"', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items`,
    { resolveBodyOnly: false }
  )

  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
})
