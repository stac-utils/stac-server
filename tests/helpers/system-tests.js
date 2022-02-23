// @ts-check

const nock = require('nock')
const { createCollectionsIndex, refreshIndices } = require('./es')
const { createTopic, addSnsToSqsSubscription } = require('./sns')
const { createQueue, getQueueArn } = require('./sqs')

/**
 * @typedef {Object} StandUpResult
 * @property {string} ingestQueueUrl
 * @property {string} ingestTopicArn
 */

/**
 * @returns {Promise<StandUpResult>}
 */
const setup = async () => {
  nock.disableNetConnect()
  nock.enableNetConnect('localhost')

  // Create Ingest SNS topic
  const ingestTopicArn = await createTopic()

  // Create SQS queue
  const ingestQueueUrl = await createQueue()
  const ingestQueueArn = await getQueueArn(ingestQueueUrl)

  // Subscribe SQS queue to SNS topic
  await addSnsToSqsSubscription(
    ingestTopicArn,
    ingestQueueArn
  )

  // Create ES collections index
  await createCollectionsIndex()

  await refreshIndices()

  return {
    ingestQueueUrl,
    ingestTopicArn
  }
}

module.exports = {
  setup
}
