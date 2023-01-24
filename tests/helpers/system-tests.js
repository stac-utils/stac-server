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
export const setup = async () => {
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
