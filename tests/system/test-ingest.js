'use strict'

const test = require('ava')
const esClient = require('../../src/lib/esClient')
const awsClients = require('../../src/lib/aws-clients')
const { handler } = require('../../src/lambdas/ingest')
const {
  loadFixture,
  noop,
  nullLogger,
  randomId
} = require('../helpers/utils')
const { getCollectionIds } = require('../helpers/api-client')
const { connect } = require('../../src/lib/esClient')

const sqsMessageToRecord = (message) => ({
  messageId: message.MessageId,
  receiptHandle: message.ReceiptHandle,
  body: message.Body,
  attributes: {},
  messageAttributes: {},
  md5OfBody: message.MD5OfBody,
  eventSource: 'aws:sqs',
  eventSourceARN: 'sqs-queue-arn',
  awsRegion: 'us-east-1'
})

test.before(async (t) => {
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
  await esClient.create_index('collections')
})

test.beforeEach(async (t) => {
  const { ingestQueueUrl } = t.context

  await awsClients.sqs().purgeQueue({ QueueUrl: ingestQueueUrl }).promise()
})

test.after.always(async (t) => {
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

const eventFromQueue = async (ingestQueueUrl) => {
  const { Messages } = await awsClients.sqs().receiveMessage({
    QueueUrl: ingestQueueUrl,
    WaitTimeSeconds: 1
  }).promise()

  return {
    Records: Messages.map((m) => sqsMessageToRecord(m))
  }
}

test.only('The ingest lambda supports ingesting a collection published to SNS', async (t) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  await awsClients.sns().publish({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify(collection)
  }).promise()

  const event = await eventFromQueue(ingestQueueUrl)

  await handler(event, { logger: nullLogger })

  const e = await connect()

  await e.indices.refresh({ index: '_all' })

  const collectionIds = await getCollectionIds()

  console.log('>>> collection.id:', collection.id)
  console.log('>>> collectionIds:', collectionIds)

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
    Message: JSON.stringify({ Bucket: sourceBucket, Key: sourceKey })
  }).promise()

  const event = await eventFromQueue(ingestQueueUrl)

  await handler(event, { logger: nullLogger })

  const collectionIds = await getCollectionIds()

  t.true(collectionIds.includes(collection.id))
})
