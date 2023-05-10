import { sns } from './aws-clients.js'
import logger from './logger.js'
import { isCollection, isItem } from './stac-utils.js'

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

  return {
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
    }
  }
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
