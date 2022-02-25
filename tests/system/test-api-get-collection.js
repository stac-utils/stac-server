const { default: anyTest } = require('ava')
const { apiClient } = require('../helpers/api-client')
const { deleteAllIndices } = require('../helpers/es')
const { ingestItem } = require('../helpers/ingest')
const { randomId, loadFixture } = require('../helpers/utils')
const systemTests = require('../helpers/system-tests')

/**
 * @template T
 * @typedef {import('ava').TestFn<T>} TestFn<T>
 */

/**
 * @typedef {import('../helpers/types').SystemTestContext} SystemTestContext
 */

/**
 * @typedef {Object} TestContext
 * @property {string} collectionId
 */

const test = /** @type {TestFn<TestContext & SystemTestContext>} */ (anyTest)

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await systemTests.setup()

  t.context.ingestQueueUrl = standUpResult.ingestQueueUrl
  t.context.ingestTopicArn = standUpResult.ingestTopicArn

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

test('GET /collections/:collectionId returns a collection', async (t) => {
  const { collectionId } = t.context

  const response = await apiClient.get(`collections/${collectionId}`)

  // @ts-expect-error We need to validate these responses
  t.is(response.id, collectionId)
})

test('GET /collection/:collectionId has a content type of "application/json', async (t) => {
  const { collectionId } = t.context

  const response = await apiClient.get(
    `collections/${collectionId}`,
    { resolveBodyOnly: false }
  )

  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
})
