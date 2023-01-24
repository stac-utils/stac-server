const { default: got } = require('got')
const dbClient = require('../../lib/databaseClient.js')
const stream = require('../../lib/databaseStream.js')
const ingest = require('../../lib/ingest.js')
const s3Utils = require('../../lib/s3-utils')
const { logger } = require('../../lib/logger')

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

module.exports.handler = async function handler(event, _context) {
  logger.debug('Event: %j', event)

  if (event.create_indices) {
    await dbClient.createIndex('collections')
  }

  const stacItems = isSqsEvent(event)
    ? await stacItemsFromSqsEvent(event)
    : [event]

  try {
    await ingest.ingestItems(stacItems, stream)
    logger.debug('Ingested %d items: %j', stacItems.length, stacItems)
  } catch (error) {
    logger.error(error)
    throw (error)
  }
}
