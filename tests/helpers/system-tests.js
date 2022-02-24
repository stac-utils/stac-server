// @ts-check

const nock = require('nock')
const { createCollectionsIndex, refreshIndices } = require('./es')
const { createTopic, addSnsToSqsSubscription } = require('./sns')
const { createQueue, getQueueArn } = require('./sqs')

/**
 * @typedef {Object} StandUpResult
 * @property {string} ingestQueueUrl
 * @property {string} ingestTopicArn
 * @property {string} postIngestQueueUrl
 * @property {string} postIngestTopicArn
 */

/**
 * @returns {Promise<StandUpResult>}
 */
const setup = async () => {
  nock.disableNetConnect()
  nock.enableNetConnect('localhost')

  // Create Ingest SNS topics
  const ingestTopicArn = await createTopic()
  const postIngestTopicArn = await createTopic()

  // Create SQS queues
  const ingestQueueUrl = await createQueue()
  const postIngestQueueUrl = await createQueue()
  const ingestQueueArn = await getQueueArn(ingestQueueUrl)
  const postIngestQueueArn = await getQueueArn(postIngestQueueUrl)

  // Subscribe SQS queues to SNS topics
  await addSnsToSqsSubscription(
    ingestTopicArn,
    ingestQueueArn
  )
  await addSnsToSqsSubscription(
    postIngestTopicArn,
    postIngestQueueArn
  )

  // Create ES collections index
  await createCollectionsIndex()

  await refreshIndices()

  return {
    ingestQueueUrl,
    ingestTopicArn,
    postIngestQueueUrl,
    postIngestTopicArn
  }
}

module.exports = {
  setup
}
