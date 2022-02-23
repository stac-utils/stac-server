// @ts-check

const awsClients = require('../../src/lib/aws-clients')
const { handler } = require('../../src/lambdas/ingest')
const { sqsTriggerLambda } = require('./sqs')
const { nullLoggerContext } = require('./context')
const { refreshIndices } = require('./es')

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

module.exports = {
  ingestItem
}
