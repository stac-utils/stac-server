// @ts-check

const nock = require('nock')
const { startApi } = require('./api')
const { createCollectionsIndex, refreshIndices } = require('./es')
const { createTopic, addSnsToSqsSubscription } = require('./sns')
const { createQueue, getQueueArn } = require('./sqs')

/**
 * @typedef {import('./api').ApiInstance} ApiInstance
 */

/**
 * @typedef {Object} StandUpResult
 * @property {ApiInstance} api
 * @property {string} ingestQueueUrl
 * @property {string} ingestTopicArn
 */

/**
 * @returns {Promise<StandUpResult>}
 */
const setup = async () => {
  nock.disableNetConnect()
  nock.enableNetConnect(/127\.0\.0\.1|localhost/)

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

  const api = await startApi()

  return {
    api,
    ingestQueueUrl,
    ingestTopicArn
  }
}

module.exports = {
  setup
}
