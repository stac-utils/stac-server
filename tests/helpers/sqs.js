const awsClients = require('../../src/lib/aws-clients')

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

module.exports = {
  sqsTriggerLambda
}
