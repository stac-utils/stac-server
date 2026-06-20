import { PublishCommand, MessageAttributeValue } from '@aws-sdk/client-sns'
import { sns } from './aws-clients.js'
import logger from './logger.js'
import { getBBox, getStartAndEndDates, isCollection, isItem } from './stac-utils.js'
import { StacRecord } from './types.js'

interface SNSPayload {
  record: StacRecord
  error: string | undefined
}
/**
 * Extract STAC Item attriutes from SNS payload for adding attributes
 * to SNS message publish.  Extract core set of attributes to enable filtering
 * on SNS publishing down stream, and add other attributes if they are
 * on the item
 * @returns Attribute objects with a number of key attributes to
 * filter SNS messages on
 */
const attrsFromPayload = function (
  payload: SNSPayload
): Record<string, MessageAttributeValue> {
  let type = 'unknown'
  let collection = ''
  if (isCollection(payload.record)) {
    type = 'Collection'
    collection = payload.record.id || ''
  } else if (isItem(payload.record)) {
    type = 'Item'
    collection = payload.record.collection || ''
  }

  const attributes: Record<string, MessageAttributeValue> = {
    recordType: {
      DataType: 'String',
      StringValue: type
    },
    ingestStatus: {
      DataType: 'String',
      StringValue: payload.error ? 'failed' : 'successful'
    },
    collection: {
      DataType: 'String',
      StringValue: collection
    },
  }

  const bbox = getBBox(payload.record)
  if (bbox) {
    attributes['bbox.sw_lon'] = {
      DataType: 'Number',
      StringValue: bbox[0].toString(),
    }
    attributes['bbox.sw_lat'] = {
      DataType: 'Number',
      StringValue: bbox[1].toString(),
    }
    attributes['bbox.ne_lon'] = {
      DataType: 'Number',
      StringValue: bbox[2].toString(),
    }
    attributes['bbox.ne_lat'] = {
      DataType: 'Number',
      StringValue: bbox[3].toString(),
    }
  }

  if (isItem(payload.record) && payload.record.properties?.datetime) {
    attributes['datetime'] = {
      DataType: 'String',
      StringValue: payload.record.properties.datetime
    }
  }

  const { startDate, endDate } = getStartAndEndDates(payload.record)

  if (startDate) {
    attributes['start_datetime'] = {
      DataType: 'String',
      StringValue: startDate.toISOString()
    }
    attributes['start_unix_epoch_ms_offset'] = {
      DataType: 'Number',
      StringValue: startDate.getTime().toString()
    }
  }

  if (endDate) {
    attributes['end_datetime'] = {
      DataType: 'String',
      StringValue: endDate.toISOString()
    }
    attributes['end_unix_epoch_ms_offset'] = {
      DataType: 'Number',
      StringValue: endDate.getTime().toString()
    }
  }

  return attributes
}

/**
 * Publish message to post-ingest sns topic after ingestion to catalog
 */
export async function publishRecordToSns(
  topicArn: string,
  record: StacRecord,
  error: string | undefined
): Promise<void> {
  const payload: SNSPayload = { record, error }
  try {
    const command = new PublishCommand({
      Message: JSON.stringify(payload),
      TopicArn: topicArn,
      MessageAttributes: attrsFromPayload(payload)
    })
    await sns().send(command)
    logger.info(`Wrote record ${record.id} to ${topicArn}`)
  } catch (err) {
    logger.error(`Failed to write record ${record.id} to ${topicArn}: ${err}`)
  }
}
