import { sns, sqs } from '../../src/lib/aws-clients.js'
import { handler } from '../../src/lambdas/ingest/index.js'
import { sqsTriggerLambda } from './sqs.js'
import { refreshIndices } from './database.js'
import { loadFixture } from './utils.js'

/**
 * @typedef {Object} IngestItemParams
 * @property {string} ingestTopicArn
 * @property {string} ingestQueueUrl
 * @property {unknown} item
 */

/**
 * @param {IngestItemParams} params
 * @returns {Promise<void>}
 */
export const ingestItem = async (params) => {
  await sns().publish({
    TopicArn: params.ingestTopicArn,
    Message: JSON.stringify(params.item)
  })

  await sqsTriggerLambda(params.ingestQueueUrl, handler)

  await refreshIndices()
}

// eslint-disable-next-line valid-jsdoc
/**
 * @param {string} ingestTopicArn
 * @param {string} ingestQueueUrl
 * @returns {(item: unknown) => Promise<void>}
 */
export const ingestItemC = (ingestTopicArn, ingestQueueUrl) =>
  (item) => ingestItem({ ingestQueueUrl, ingestTopicArn, item })

/**
 * @param {Object} params
 * @param {string} params.ingestTopicArn
 * @param {string} params.ingestQueueUrl
 * @param {string} params.filename
 * @param {Object} params.overrides
 * @returns {Promise<unknown>}
 */
export const ingestFixture = async ({
  ingestTopicArn,
  ingestQueueUrl,
  filename,
  overrides = {}
}) => {
  const item = await loadFixture(filename, overrides)

  await ingestItem({
    ingestTopicArn,
    ingestQueueUrl,
    item
  })

  return item
}

// eslint-disable-next-line valid-jsdoc
/**
 * @param {string} ingestTopicArn
 * @param {string} ingestQueueUrl
 * @returns {(filename: string, overrides?: Object) => Promise<unknown>}
 */
export const ingestFixtureC = (ingestTopicArn, ingestQueueUrl) =>
  (filename, overrides = {}) => ingestFixture({
    ingestQueueUrl,
    ingestTopicArn,
    filename,
    overrides
  })

export async function testPostIngestSNS(t, record, shouldError = false) {
  // @ts-ignore
  process.env.POST_INGEST_TOPIC_ARN = t.context.postIngestTopicArn

  await sns().publish({
    TopicArn: t.context.ingestTopicArn,
    Message: JSON.stringify(record)
  })

  try {
    await sqsTriggerLambda(t.context.ingestQueueUrl, handler)
  } catch (_) {
    if (!shouldError) {
      t.fail('Ingest had error, but should not have.')
    }
  }

  const { Messages } = await sqs().receiveMessage({
    QueueUrl: t.context.postIngestQueueUrl,
    WaitTimeSeconds: 1
  })

  t.truthy(Messages, 'Post-ingest message not found in queue')
  t.false(Messages && Messages.length > 1, 'More than one message in post-ingest queue')

  const message = Messages && Messages.length > 0 ? Messages[0] : undefined
  const messageBody = message && message.Body ? JSON.parse(message.Body) : undefined

  return {
    message: messageBody && messageBody.Message ? JSON.parse(messageBody.Message) : undefined,
    attrs: messageBody ? messageBody.MessageAttributes : undefined
  }
}
