const awsClients = require('../../src/lib/aws-clients')
const { handler } = require('../../src/lambdas/ingest')
const { sqsTriggerLambda } = require('./sqs')
const { nullLoggerContext } = require('./context')
const { refreshIndices } = require('./database')
const { loadFixture } = require('./utils')

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
const ingestItem = async (params) => {
  await awsClients.sns().publish({
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
const ingestItemC = (ingestTopicArn, ingestQueueUrl) =>
  (item) => ingestItem({ ingestQueueUrl, ingestTopicArn, item })

/**
 * @param {Object} params
 * @param {string} params.ingestTopicArn
 * @param {string} params.ingestQueueUrl
 * @param {string} params.filename
 * @param {Object} params.overrides
 * @returns {Promise<unknown>}
 */
const ingestFixture = async ({
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
const ingestFixtureC = (ingestTopicArn, ingestQueueUrl) =>
  (filename, overrides = {}) => ingestFixture({
    ingestQueueUrl,
    ingestTopicArn,
    filename,
    overrides
  })

module.exports = {
  ingestFixture,
  ingestFixtureC,
  ingestItem,
  ingestItemC
}
