// @ts-check

const { default: anyTest } = require('ava')
const nock = require('nock')
const { getCollectionIds } = require('../helpers/api-client')
const { handler } = require('../../src/lambdas/ingest')
const { loadFixture, randomId } = require('../helpers/utils')
const { nullLoggerContext } = require('../helpers/context')
const { refreshIndices, deleteAllIndices } = require('../helpers/es')
const { sqsTriggerLambda, purgeQueue } = require('../helpers/sqs')
const { testPostIngestSNS } = require('../helpers/ingest-sns')
const awsClients = require('../../src/lib/aws-clients')
const systemTests = require('../helpers/system-tests')
const ingest = require('../../src/lib/ingest')

/**
 * @template T
 * @typedef {import('ava').TestFn<T>} TestFn<T>
 */

/**
 * @typedef {Object} TestContext
 * @property {string} [ingestQueueUrl]
 * @property {string} [ingestTopicArn]
 * @property {string} [postIngestQueueUrl]
 * @property {string} [postIngestTopicArn]
 */

const test = /** @type {TestFn<TestContext>} */ (anyTest)

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await systemTests.setup()

  t.context.ingestQueueUrl = standUpResult.ingestQueueUrl
  t.context.ingestTopicArn = standUpResult.ingestTopicArn
  t.context.postIngestQueueUrl = standUpResult.postIngestQueueUrl
  t.context.postIngestTopicArn = standUpResult.postIngestTopicArn

  const collection = await loadFixture(
    'stac/ingest-collection.json',
    { id: 'ingest' }
  )

  await ingest([collection])

  await refreshIndices()
})

test.beforeEach(async (t) => {
  const { ingestQueueUrl, postIngestQueueUrl } = t.context

  if (ingestQueueUrl === undefined) throw new Error('No ingest queue url')
  if (postIngestQueueUrl === undefined) throw new Error('No post-ingest queue url')

  await purgeQueue(ingestQueueUrl)
  await purgeQueue(postIngestQueueUrl)
})

test.afterEach.always(() => {
  nock.cleanAll()
})

test('The ingest lambda supports ingesting a collection published to SNS', async (t) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

  if (ingestTopicArn === undefined) throw new Error('No ingest topic ARN')

  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  await awsClients.sns().publish({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify(collection)
  }).promise()

  await sqsTriggerLambda(ingestQueueUrl, handler, nullLoggerContext)

  await refreshIndices()

  const collectionIds = await getCollectionIds()

  t.true(collectionIds.includes(collection.id))
})

test('The ingest lambda supports ingesting a collection sourced from S3', async (t) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

  if (ingestTopicArn === undefined) throw new Error('No ingest topic ARN')

  const s3 = awsClients.s3()

  // Load the collection to be ingested
  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  // Create the S3 bucket to source the collection from
  const sourceBucket = randomId('bucket')
  const sourceKey = randomId('key')

  await s3.createBucket({
    Bucket: sourceBucket
  }).promise()

  await s3.putObject({
    Bucket: sourceBucket,
    Key: sourceKey,
    Body: JSON.stringify(collection)
  }).promise()

  await awsClients.sns().publish({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify({ href: `s3://${sourceBucket}/${sourceKey}` })
  }).promise()

  await sqsTriggerLambda(ingestQueueUrl, handler, nullLoggerContext)

  await refreshIndices()

  const collectionIds = await getCollectionIds()

  t.true(collectionIds.includes(collection.id))
})

test('The ingest lambda supports ingesting a collection sourced from http', async (t) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

  if (ingestTopicArn === undefined) throw new Error('No ingest topic ARN')

  // Load the collection to be ingested
  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  nock('http://source.local').get('/my-file.dat').reply(200, collection)

  await awsClients.sns().publish({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify({ href: 'http://source.local/my-file.dat' })
  }).promise()

  await sqsTriggerLambda(ingestQueueUrl, handler, nullLoggerContext)

  await refreshIndices()

  const collectionIds = await getCollectionIds()

  t.true(collectionIds.includes(collection.id))
})

test('Ingest collection publish to post-ingest SNS', async (t) => {
  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  const { message, attrs } = await testPostIngestSNS(t, collection)

  t.is(message.record.id, collection.id)
  t.is(attrs.collection.Value, collection.id)
  t.is(attrs.ingestStatus.Value, 'successful')
  t.is(attrs.recordType.Value, 'Collection')
})

test('Ingest collection failed publish to post-ingest SNS', async (t) => {
  const { message, attrs } = await testPostIngestSNS(t, {
    type: 'Collection',
    id: 'badCollection'
  })

  t.is(message.record.id, 'badCollection')
  t.is(attrs.collection.Value, 'badCollection')
  t.is(attrs.ingestStatus.Value, 'failed')
  t.is(attrs.recordType.Value, 'Collection')
})

test('Ingest item publish to post-ingest SNS', async (t) => {
  const item = await loadFixture(
    'stac/ingest-item.json',
    { id: randomId('item') }
  )

  const { message, attrs } = await testPostIngestSNS(t, item)

  t.is(message.record.id, item.id)
  t.deepEqual(message.record.links, item.links)
  t.is(attrs.collection.Value, item.collection)
  t.is(attrs.ingestStatus.Value, 'successful')
  t.is(attrs.recordType.Value, 'Feature')
})

test('Ingest item publish to post-ingest SNS rewrite links', async (t) => {
  process.env['API_ENDPOINT'] = 'ENDPOINT'

  const item = await loadFixture(
    'stac/ingest-item.json',
    { id: randomId('item') }
  )

  const { message, attrs } = await testPostIngestSNS(t, item)

  /**
   * @typedef {Object} Link
   * @property {string} [href]
   * @property {string} [rel]
   */
  t.is(message.record.id, item.id)
  t.true(message.record.links.every((/** @type {Link} */ link) => (
    link.href && link.href.startsWith('ENDPOINT/'))))
  t.is(attrs.collection.Value, item.collection)
  t.is(attrs.ingestStatus.Value, 'successful')
  t.is(attrs.recordType.Value, 'Feature')
})

test('Ingest item failed publish to post-ingest SNS', async (t) => {
  const { message, attrs } = await testPostIngestSNS(t, {
    type: 'Feature',
    id: 'badItem',
    collection: 'ingest'
  })

  t.is(message.record.id, 'badItem')
  t.is(attrs.collection.Value, 'ingest')
  t.is(attrs.ingestStatus.Value, 'failed')
  t.is(attrs.recordType.Value, 'Feature')
})
