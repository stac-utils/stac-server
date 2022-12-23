const nock = require('nock')
const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const { startApi } = require('./api')
const { createCollectionsIndex, refreshIndices } = require('./database')
const { createTopic, addSnsToSqsSubscription } = require('./sns')
const { createQueue, getQueueArn } = require('./sqs')

const setupResources = async () => {
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

  const { ingestQueueUrl, ingestTopicArn } = await setupResources()

  const api = await startApi()

  return {
    api,
    ingestQueueUrl,
    ingestTopicArn
  }
}

const readFile = promisify(fs.readFile)

/**
 * @param {string} filename
 * @returns {Promise<unknown>}
 */
const loadJson = async (filename) => {
  const filePath = path.join(__dirname, '..', 'fixtures', 'stac', filename)

  const data = await readFile(filePath, 'utf8')
  return JSON.parse(data)
}

module.exports = {
  setup,
  loadJson,
  setupResources
}
