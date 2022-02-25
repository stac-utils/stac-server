const test = require('ava')
const { ingestItem } = require('../helpers/ingest')
const { randomId, loadFixture } = require('../helpers/utils')
const { refreshIndices, deleteAllIndices } = require('../helpers/es')
const systemTests = require('../helpers/system-tests')

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await systemTests.setup()

  t.context = standUpResult

  const collectionId = randomId('collection')

  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: collectionId }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: collection
  })
})

test('GET /collections', async (t) => {
  await refreshIndices()

  const response = await t.context.api.client.get('collections')

  t.true(Array.isArray(response.collections))
  t.true(response.collections.length > 0)

  t.truthy(response.context.returned)
})

test('GET /collections has a content type of "application/json', async (t) => {
  const response = await t.context.api.client.get('collections', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
})
