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
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET /collections/:collectionId returns a collection', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.get(`collections/${collectionId}`)

  // @ts-expect-error We need to validate these responses
  t.is(response.id, collectionId)
})

test('GET /collection/:collectionId has a content type of "application/json', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}`,
    { resolveBodyOnly: false }
  )

  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
})
