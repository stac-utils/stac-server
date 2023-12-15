/* eslint-disable import/prefer-default-export */
import got from 'got' // eslint-disable-line import/no-unresolved
import { createIndex } from '../../lib/database-client.js'
import { ingestItems, publishResultsToSns } from '../../lib/ingest.js'
import getObjectJson from '../../lib/s3-utils.js'
import logger from '../../lib/logger.js'

const isSqsEvent = (event) => 'Records' in event

const isSnsMessage = (record) => record.Type === 'Notification'

const stacItemFromSnsMessage = async (message) => {
  if ('href' in message) {
    const { protocol, hostname, pathname } = new URL(message.href)

    if (protocol === 's3:') {
      return await getObjectJson({
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

export const handler = async (event, _context) => {
  logger.debug('Event: %j', event)

  if (event.create_indices) {
    await createIndex('collections')
    return
  }

  const stacItems = isSqsEvent(event)
    ? await stacItemsFromSqsEvent(event)
    : [event]

  try {
    logger.debug('Attempting to ingest %d items', stacItems.length)

    const results = await ingestItems(stacItems)

    const errorCount = results.filter((result) => result.error).length
    if (errorCount) {
      logger.debug('There were %d errors ingesting %d items', errorCount, stacItems.length)
    } else {
      logger.debug('Ingested %d items', results.length)
    }

    const postIngestTopicArn = process.env['POST_INGEST_TOPIC_ARN']

    if (postIngestTopicArn) {
      logger.debug('Publishing to post-ingest topic: %s', postIngestTopicArn)
      await publishResultsToSns(results, postIngestTopicArn)
    } else {
      logger.debug('Skipping post-ingest notification since no topic is configured')
    }

    if (errorCount) throw new Error('There was at least one error ingesting items.')
  } catch (error) {
    logger.error(error)
    throw (error)
  }
}
