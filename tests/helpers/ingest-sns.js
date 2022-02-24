const { handler } = require('../../src/lambdas/ingest')
const { nullLoggerContext } = require('./context')
const { sqsTriggerLambda } = require('./sqs')
const awsClients = require('../../src/lib/aws-clients')

const testPostIngestSNS = async (t, record) => {
  process.env.POST_INGEST_TOPIC_ARN = t.context.postIngestTopicArn

  await awsClients.sns().publish({
    TopicArn: t.context.ingestTopicArn,
    Message: JSON.stringify(record)
  }).promise()

  await sqsTriggerLambda(t.context.ingestQueueUrl, handler, nullLoggerContext)

  const { Messages } = await awsClients.sqs().receiveMessage({
    QueueUrl: t.context.postIngestQueueUrl,
    WaitTimeSeconds: 1
  }).promise()

  t.truthy(Messages, 'Post-ingest message not found in queue')
  t.false(Messages.length > 1, 'More than one message in post-ingest queue')

  const message = JSON.parse(Messages[0].Body)

  return {
    message: JSON.parse(message.Message),
    attrs: message.MessageAttributes
  }
}

module.exports = {
  testPostIngestSNS
}
