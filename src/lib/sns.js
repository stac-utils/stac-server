import { sns } from './aws-clients.js'
import logger from './logger.js'
import { getStartAndEndDates, isCollection, isItem } from './stac-utils.js'

const attrsFromPayload = function (payload) {
  let type = 'unknown'
  let collection = ''
  if (isCollection(payload.record)) {
    type = 'Collection'
    collection = payload.record.id || ''
  } else if (isItem(payload.record)) {
    type = 'Item'
    collection = payload.record.collection || ''
  }

  const attributes = {
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

  const { startDate, endDate } = getStartAndEndDates(payload.record)

  if (startDate) {
    attributes.startUnixEpochMsOffset = {
      DataType: 'Number',
      StringValue: startDate.getTime().toString()
    }
  }

  if (endDate) {
    attributes.endUnixEpochMsOffset = {
      DataType: 'Number',
      StringValue: endDate.getTime().toString()
    }
  }

  return attributes
}

/* eslint-disable-next-line import/prefer-default-export */
export async function publishRecordToSns(topicArn, record, error) {
  const payload = { record, error }
  try {
    await sns().publish({
      Message: JSON.stringify(payload),
      TopicArn: topicArn,
      MessageAttributes: attrsFromPayload(payload)
    }).promise()
    logger.info(`Wrote record ${record.id} to ${topicArn}`)
  } catch (err) {
    logger.error(`Failed to write record ${record.id} to ${topicArn}: ${err}`)
  }
}
