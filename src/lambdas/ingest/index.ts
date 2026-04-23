/* eslint-disable import/prefer-default-export */
import got from 'got' // eslint-disable-line import/no-unresolved
import { SQSEvent, Context, SNSMessage, SQSRecord } from 'aws-lambda'
import { createIndex } from '../../lib/database-client.js'
import { processMessages, publishResultsToSns } from '../../lib/ingest.js'
import getObjectJson from '../../lib/s3-utils.js'
import logger from '../../lib/logger.js'
import { AssetProxy } from '../../lib/asset-proxy.js'

import { ApiRecord, StacRecord } from '../../lib/types.js'

interface StacRecordRef {
  href: string
}

let assetProxy: AssetProxy | undefined

const getAssetProxy = async (): Promise<AssetProxy> => {
  if (!assetProxy) {
    assetProxy = await AssetProxy.create()
  }
  return assetProxy
}

export const resetAssetProxy = async () => {
  assetProxy = await AssetProxy.create()
}

const isStacRecordRef = (message: unknown): message is StacRecordRef =>
  typeof message === 'object'
  && message !== null
  && 'href' in message
  && typeof (message as StacRecordRef).href === 'string'

const isSqsEvent = (event: SQSEvent | ApiRecord): event is SQSEvent => 'Records' in event

const isSnsMessage = (record: unknown): record is SNSMessage =>
  typeof record === 'object'
  && record != null
  && 'Type' in record
  && record.Type === 'Notification'

const stacRecordFromSnsMessage = async (
  message: StacRecord | StacRecordRef
): Promise<StacRecord> => {
  if (isStacRecordRef(message)) {
    const { protocol, hostname, pathname } = new URL(message.href)

    if (protocol === 's3:') {
      return await getObjectJson({
        bucket: hostname,
        key: pathname.replace(/^\//, '')
      }) as StacRecord
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

const stacRecordFromSqsRecord = async (record: SQSRecord): Promise<StacRecord> => {
  const recordBody = JSON.parse(record.body)

  return isSnsMessage(recordBody)
    ? await stacRecordFromSnsMessage(JSON.parse(recordBody.Message))
    : recordBody as StacRecord
}

const stacRecordsFromSqsEvent = async (event: SQSEvent): Promise<StacRecord[]> => {
  const records = event.Records

  return await Promise.all(
    records.map((r) => stacRecordFromSqsRecord(r))
  )
}

export const handler = async (event: SQSEvent | ApiRecord, _context: Context): Promise<void> => {
  logger.debug('Event: %j', event)

  // one off direct invocation to initialize indices - not a real SQS/SNS event
  if ((event as { create_indices?: boolean }).create_indices) {
    await createIndex('collections')
    return
  }

  const messages = isSqsEvent(event)
    ? await stacRecordsFromSqsEvent(event)
    : [event]

  try {
    logger.debug('Attempting to process %d messages', messages.length)

    const results = await processMessages(messages)

    const errorCount = results.filter((result) => result.error).length
    if (errorCount) {
      logger.debug('There were %d errors ingesting %d items', errorCount, messages.length)
    } else {
      logger.debug('Ingested %d items', results.length)
    }

    const postIngestTopicArn = process.env['POST_INGEST_TOPIC_ARN']

    if (postIngestTopicArn) {
      logger.debug('Publishing to post-ingest topic: %s', postIngestTopicArn)
      await publishResultsToSns(results, postIngestTopicArn, await getAssetProxy())
    } else {
      logger.debug('Skipping post-ingest notification since no topic is configured')
    }

    if (errorCount) throw new Error('There was at least one error ingesting items.')
  } catch (error) {
    logger.error(error)
    throw (error)
  }
}
