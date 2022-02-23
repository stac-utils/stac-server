// @ts-check

const { default: anyTest } = require('ava')
const nock = require('nock')
const { getCollectionIds } = require('../helpers/api-client')
const { handler } = require('../../src/lambdas/ingest')
const { loadFixture, randomId } = require('../helpers/utils')
const { nullLoggerContext } = require('../helpers/context')
const { refreshIndices, deleteAllIndices } = require('../helpers/es')
const { sqsTriggerLambda, purgeQueue } = require('../helpers/sqs')
const awsClients = require('../../src/lib/aws-clients')
const systemTests = require('../helpers/system-tests')

/**
 * @template T
 * @typedef {import('ava').TestFn<T>} TestFn<T>
 */

/**
 * @typedef {Object} TestContext
 * @property {string} [ingestQueueUrl]
 * @property {string} [ingestTopicArn]
 */

const test = /** @type {TestFn<TestContext>} */ (anyTest)

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await systemTests.setup()

  t.context.ingestQueueUrl = standUpResult.ingestQueueUrl
  t.context.ingestTopicArn = standUpResult.ingestTopicArn
})

test.beforeEach(async (t) => {
  const { ingestQueueUrl } = t.context

  if (ingestQueueUrl === undefined) throw new Error('No ingest queue url')

  await purgeQueue(ingestQueueUrl)
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
