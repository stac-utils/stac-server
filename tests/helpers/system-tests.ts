import nock from 'nock'
import { promisify } from 'util'
import { readFile as _readFile } from 'fs'
import path, { join } from 'path'
import { fileURLToPath } from 'url'
import { startApi, ApiInstance } from './api.js'
import { createCollectionsIndex, refreshIndices } from './database.js'
import { createTopic, addSnsToSqsSubscription } from './sns.js'
import { createQueue, getQueueArn } from './sqs.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface SetupResourcesResult {
  ingestQueueUrl: string
  ingestTopicArn: string
  postIngestQueueUrl: string
  postIngestTopicArn: string
}

export const setupResources = async (): Promise<SetupResourcesResult> => {
  // Create Ingest SNS topics
  const ingestTopicArn = await createTopic()
  const postIngestTopicArn = await createTopic()

  // Create SQS queues
  const ingestQueueUrl = await createQueue()
  const ingestQueueArn = await getQueueArn(ingestQueueUrl)
  const postIngestQueueUrl = await createQueue()
  const postIngestQueueArn = await getQueueArn(postIngestQueueUrl)

  // Subscribe SQS queue to ingest SNS topic
  await addSnsToSqsSubscription(ingestTopicArn, ingestQueueArn)

  // Subscribe SQS queue to post-ingest SNS topic
  await addSnsToSqsSubscription(postIngestTopicArn, postIngestQueueArn)

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

export interface StandUpResult extends SetupResourcesResult {
  api: ApiInstance
}

export const setup = async (): Promise<StandUpResult> => {
  nock.disableNetConnect()
  nock.enableNetConnect(/127\.0\.0\.1|localhost/)

  const {
    ingestQueueUrl,
    ingestTopicArn,
    postIngestQueueUrl,
    postIngestTopicArn,
  } = await setupResources()

  const api = await startApi()

  return {
    api,
    ingestQueueUrl,
    ingestTopicArn,
    postIngestQueueUrl,
    postIngestTopicArn
  }
}

const readFile = promisify(_readFile)

export const loadJson = async (filename: string): Promise<unknown> => {
  const filePath = join(__dirname, '..', 'fixtures', 'stac', filename)

  const data = await readFile(filePath, 'utf8')
  return JSON.parse(data)
}
