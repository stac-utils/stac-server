import nock from 'nock'
import { promisify } from 'util'
import { readFile as _readFile } from 'fs'
import path, { join } from 'path'
import { fileURLToPath } from 'url'
import { startApi } from './api.js'
import { createCollectionsIndex, refreshIndices } from './database.js'
import { createTopic, addSnsToSqsSubscription } from './sns.js'
import { createQueue, getQueueArn } from './sqs.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename) // eslint-disable-line no-unused-vars

export const setupResources = async () => {
  // Create Ingest SNS topics
  const ingestTopicArn = await createTopic()
  const postIngestTopicArn = await createTopic()

  // Create SQS queues
  const ingestQueueUrl = await createQueue()
  const ingestQueueArn = await getQueueArn(ingestQueueUrl)
  const postIngestQueueUrl = await createQueue()
  const postIngestQueueArn = await getQueueArn(postIngestQueueUrl)

  // Subscribe SQS queue to ingest SNS topic
  await addSnsToSqsSubscription(
    ingestTopicArn,
    ingestQueueArn
  )

  // Subscribe SQS queue to post-ingest SNS topic
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

/**
 * @typedef {import('./api.js').ApiInstance} ApiInstance
 */

/**
 * @typedef {Object} StandUpResult
 * @property {ApiInstance} api
 * @property {string} ingestQueueUrl
 * @property {string} ingestTopicArn
 * @property {string} postIngestQueueUrl
 * @property {string} postIngestTopicArn
 */

/**
 * @param {string} enableTxn
 * @returns {Promise<StandUpResult>}
 */
export const setup = async (enableTxn = 'true') => {
  nock.disableNetConnect()
  nock.enableNetConnect(/127\.0\.0\.1|localhost/)

  const {
    ingestQueueUrl,
    ingestTopicArn,
    postIngestQueueUrl,
    postIngestTopicArn,
  } = await setupResources()

  const api = await startApi(enableTxn)

  return {
    api,
    ingestQueueUrl,
    ingestTopicArn,
    postIngestQueueUrl,
    postIngestTopicArn
  }
}

const readFile = promisify(_readFile)

/**
 * @param {string} filename
 * @returns {Promise<unknown>}
 */
export const loadJson = async (filename) => {
  const filePath = join(__dirname, '..', 'fixtures', 'stac', filename)

  const data = await readFile(filePath, 'utf8')
  return JSON.parse(data)
}
