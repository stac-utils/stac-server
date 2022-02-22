const { default: test } = require('ava')
const nock = require('nock')
const esClient = require('../../src/lib/esClient')
const awsClients = require('../../src/lib/aws-clients')
const { handler } = require('../../src/lambdas/ingest')
const {
  loadFixture,
  noop,
  randomId
} = require('../helpers/utils')
const { getCollectionIds } = require('../helpers/api-client')
const { refreshIndices } = require('../helpers/es')
const { sqsTriggerLambda } = require('../helpers/sqs')
const { nullLoggerContext } = require('../helpers/context')

test.before(async (t) => {
  nock.disableNetConnect()
  nock.enableNetConnect('localhost')

  // Create SNS topic
  const sns = awsClients.sns()

  const ingestTopicName = randomId('topic')
  const createTopicResult = await sns.createTopic({ Name: ingestTopicName }).promise()
  t.context.ingestTopicArn = createTopicResult.TopicArn

  // Create SQS queue
  const sqs = awsClients.sqs()

  const ingestQueueName = randomId('queue')
  const createQueueResult = await sqs.createQueue({
    QueueName: ingestQueueName
  }).promise()
  t.context.ingestQueueUrl = createQueueResult.QueueUrl

  const getQueueAttributesResult = await sqs.getQueueAttributes({
    QueueUrl: t.context.ingestQueueUrl,
    AttributeNames: ['QueueArn']
  }).promise()

  // Subscribe SQS queue to SNS topic
  await sns.subscribe({
    TopicArn: t.context.ingestTopicArn,
    Protocol: 'sqs',
    Endpoint: getQueueAttributesResult.Attributes.QueueArn
  }).promise()

  // Create ES collections index
  await esClient.createIndex('collections')
})

test.beforeEach(async (t) => {
  const { ingestQueueUrl } = t.context

  await awsClients.sqs().purgeQueue({ QueueUrl: ingestQueueUrl }).promise()
})

test.afterEach.always(() => {
  nock.cleanAll()
})

test.after.always(async (t) => {
  nock.enableNetConnect()

  const { ingestQueueUrl } = t.context

  // Delete SQS queue
  await awsClients.sqs().deleteQueue({
    QueueUrl: ingestQueueUrl
  }).promise().catch(noop)

  // Delete SNS topic
  await awsClients.sns().deleteTopic({
    TopicArn: t.context.ingestTopicArn
  }).promise().catch(noop)
})

test('The ingest lambda supports ingesting a collection published to SNS', async (t) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

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
