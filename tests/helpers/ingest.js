// @ts-check

import { sns } from '../../src/lib/aws-clients.js'
import handler from '../../src/lambdas/ingest/index.js'
import { sqsTriggerLambda } from './sqs.js'
import nullLoggerContext from './context.js'
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
  }).promise()

  await sqsTriggerLambda(params.ingestQueueUrl, handler, nullLoggerContext)

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
