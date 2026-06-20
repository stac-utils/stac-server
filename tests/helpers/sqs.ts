import { isUndefined } from 'lodash-es'
import {
  ReceiveMessageCommand,
  PurgeQueueCommand,
  CreateQueueCommand,
  GetQueueAttributesCommand,
  Message
} from '@aws-sdk/client-sqs'
import type { SQSEvent, SQSRecord, Context } from 'aws-lambda'
import { sqs as _sqs } from '../../src/lib/aws-clients.js'
import { randomId } from './utils.js'

const sqsMessageToRecord = (message: Message): SQSRecord => ({
  messageId: message.MessageId ?? '',
  receiptHandle: message.ReceiptHandle ?? '',
  body: message.Body ?? '',
  attributes: {
    ApproximateReceiveCount: '',
    SentTimestamp: '',
    SenderId: '',
    ApproximateFirstReceiveTimestamp: ''
  },
  messageAttributes: {},
  md5OfBody: message.MD5OfBody ?? '',
  eventSource: 'aws:sqs',
  eventSourceARN: 'sqs-queue-arn',
  awsRegion: 'us-east-1'
})

const eventFromQueue = async (ingestQueueUrl: string): Promise<SQSEvent> => {
  const command = new ReceiveMessageCommand({
    QueueUrl: ingestQueueUrl,
    WaitTimeSeconds: 1
  })
  const { Messages } = await _sqs().send(command)

  return {
    Records: (Messages ?? []).map((m) => sqsMessageToRecord(m))
  }
}

export const sqsTriggerLambda = async (
  sqsUrl: string,
  handler: (event: SQSEvent, context: Context) => Promise<void>,
  _context = {} as Context
): Promise<void> => {
  const event = await eventFromQueue(sqsUrl)
  return handler(event, _context)
}

export const purgeQueue = async (url: string): Promise<void> => {
  const command = new PurgeQueueCommand({ QueueUrl: url })
  await _sqs().send(command)
}

export const createQueue = async (): Promise<string> => {
  const sqs = _sqs()

  const command = new CreateQueueCommand({
    QueueName: randomId('queue')
  })
  const { QueueUrl } = await sqs.send(command)

  if (QueueUrl) return QueueUrl

  throw new Error('Failed to create queue')
}

export const getQueueArn = async (queueUrl: string): Promise<string> => {
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
