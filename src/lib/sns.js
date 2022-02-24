const awsClients = require('./aws-clients')
const stacUtils = require('./stac-utils')
const logger = console

const attrsFromPayload = function (payload) {
  let type = 'unknown'
  let collection = ''
  if (stacUtils.isCollection(payload.record)) {
    type = 'Collection'
    collection = payload.record.id || ''
  } else if (stacUtils.isItem(payload.record)) {
    type = 'Feature'
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

const publishRecordToSNS = async function (topicArn, record, error) {
  const payload = {
    record: record,
    error: error
  }

  try {
    await awsClients.sns().publish({
      Message: JSON.stringify(payload),
      TopicArn: topicArn,
      MessageAttributes: attrsFromPayload(payload)
    }).promise()
    logger.info(`Wrote record ${record.id} to ${topicArn}`)
  } catch (err) {
    logger.error(`Failed to write record ${record.id} to ${topicArn}: ${err}`)
  }
}

module.exports = publishRecordToSNS
