// @ts-nocheck

import { isUndefined } from 'lodash-es'
import {
  ReceiveMessageCommand,
  PurgeQueueCommand,
  CreateQueueCommand,
  GetQueueAttributesCommand
} from '@aws-sdk/client-sqs'
import { sqs as _sqs } from '../../src/lib/aws-clients.js'
import { randomId } from './utils.js'

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
  const command = new ReceiveMessageCommand({
    QueueUrl: ingestQueueUrl,
    WaitTimeSeconds: 1
  })
  const { Messages } = await _sqs().send(command)

  return {
    Records: Messages.map((m) => sqsMessageToRecord(m))
  }
}

export const sqsTriggerLambda = async (sqsUrl, handler, _context = {}) => {
  const event = await eventFromQueue(sqsUrl)
  return handler(event, {})
}

/**
 * @param {string} url
 * @returns {Promise<void>}
 */
export const purgeQueue = async (url) => {
  const command = new PurgeQueueCommand({ QueueUrl: url })
  await _sqs().send(command)
}

/**
 * @returns {Promise<string>} the queue URL
 */
export const createQueue = async () => {
  const sqs = _sqs()

  const command = new CreateQueueCommand({
    QueueName: randomId('queue')
  })
  const { QueueUrl } = await sqs.send(command)

  if (QueueUrl) return QueueUrl

  throw new Error('Failed to create queue')
}

/**
 * @param {string} queueUrl
 * @returns {Promise<string>} queueArn
 */
export const getQueueArn = async (queueUrl) => {
  const sqs = _sqs()

  const command = new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: ['QueueArn']
  })
  const getQueueAttributesResult = await sqs.send(command)

  if (
    isUndefined(getQueueAttributesResult.Attributes)
    || isUndefined(getQueueAttributesResult.Attributes['QueueArn'])
  ) throw new Error('Unable to get Queue ARN')

  return getQueueAttributesResult.Attributes['QueueArn']
}
