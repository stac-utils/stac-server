// @ts-nocheck

const { isUndefined } = require('lodash')
const awsClients = require('../../src/lib/aws-clients')
const { randomId } = require('./utils')

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

const eventFromQueue = async (ingestQueueUrl) => {
  const { Messages } = await awsClients.sqs().receiveMessage({
    QueueUrl: ingestQueueUrl,
    WaitTimeSeconds: 1
  }).promise()

  return {
    Records: Messages.map((m) => sqsMessageToRecord(m))
  }
}

const sqsTriggerLambda = async (sqsUrl, handler, context = {}) => {
  const event = await eventFromQueue(sqsUrl)
  return handler(event, context)
}

/**
 * @param {string} url
 * @returns {Promise<void>}
 */
const purgeQueue = async (url) => {
  await awsClients.sqs().purgeQueue({ QueueUrl: url }).promise()
}

/**
 * @returns {Promise<string>} the queue URL
 */
const createQueue = async () => {
  const sqs = awsClients.sqs()

  const { QueueUrl } = await sqs.createQueue({
    QueueName: randomId('queue')
  }).promise()

  if (QueueUrl) return QueueUrl

  throw new Error('Failed to create queue')
}

/**
 * @param {string} queueUrl
 * @returns {Promise<string>} queueArn
 */
const getQueueArn = async (queueUrl) => {
  const sqs = awsClients.sqs()

  const getQueueAttributesResult = await sqs.getQueueAttributes({
    QueueUrl: queueUrl,
    AttributeNames: ['QueueArn']
  }).promise()

  if (
    isUndefined(getQueueAttributesResult.Attributes)
    || isUndefined(getQueueAttributesResult.Attributes['QueueArn'])
  ) throw new Error('Unable to get Queue ARN')

  return getQueueAttributesResult.Attributes['QueueArn']
}

module.exports = {
  createQueue,
  getQueueArn,
  purgeQueue,
  sqsTriggerLambda
}
