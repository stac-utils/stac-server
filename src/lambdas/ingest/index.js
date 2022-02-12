const { default: got } = require('got')
const esClient = require('../../lib/esClient')
const ingest = require('../../lib/ingest')
const publishRecordToSNS = require('../../lib/sns')
const s3Utils = require('../../lib/s3-utils')

const POST_INGEST_TOPIC_ARN = process.env.POST_INGEST_TOPIC_ARN || ''
const API_ENDPOINT = process.env.API_ENDPOINT || ''

const isSqsEvent = (event) => 'Records' in event

const isSnsMessage = (record) => record.Type === 'Notification'

const stacItemFromSnsMessage = async (message) => {
  if ('href' in message) {
    const { protocol, hostname, pathname } = new URL(message.href)

    if (protocol === 's3:') {
      return await s3Utils.getObjectJson({
        bucket: hostname,
        key: pathname.replace(/^\//, '')
      })
    }

    if (protocol.startsWith('http')) {
      return await got.get(message.href, {
        resolveBodyOnly: true
      }).json()
    }

    throw new Error(`Unsupported source: ${message.href}`)
  }

  return message
}

const stacItemFromRecord = async (record) => {
  const recordBody = JSON.parse(record.body)

  return isSnsMessage(recordBody)
    ? await stacItemFromSnsMessage(JSON.parse(recordBody.Message))
    : recordBody
}

const stacItemsFromSqsEvent = async (event) => {
  const records = event.Records

  return await Promise.all(
    records.map((r) => stacItemFromRecord(r))
  )
}

const postIngestHandler = async function (record, err) {
  await publishRecordToSNS(
    POST_INGEST_TOPIC_ARN,
    record,
    err
  )
}

module.exports.handler = async function handler(event, context) {
  const { logger = console } = context

  logger.debug(`Event: ${JSON.stringify(event, undefined, 2)}`)

  if (event.create_indices) {
    await esClient.createIndex('collections')
  }

  const stacItems = isSqsEvent(event)
    ? await stacItemsFromSqsEvent(event)
    : [event]

  logger.info(`Ingesting ${stacItems.length} items`)
  const ingestOptions = {
    endpoint: API_ENDPOINT
  }
  if (POST_INGEST_TOPIC_ARN) {
    ingestOptions.successHandler = postIngestHandler
    ingestOptions.errorHandler = postIngestHandler
  }

  try {
    await ingest(stacItems, ingestOptions)
  } catch (error) {
    logger.error(error)
    throw (error)
  }
  logger.debug('Ingest completed')
}
