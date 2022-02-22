const AWS = require('aws-sdk')
const logger = console

AWS.config.credentials = new AWS.EnvironmentCredentials('AWS')
const AWS_REGION = process.env.AWS_REGION

const sns = new AWS.SNS({
  region: AWS_REGION,
  apiVersion: '2010-03-31'
})

const attrsFromPayload = function (payload) {
  return {
    recordType: {
      DataType: 'String',
      // is it okay for pre-1.0.0 stac items this is unknown?
      StringValue: payload.record.type || 'unknown'
    },
    ingestStatus: {
      DataType: 'String',
      StringValue: payload.error ? 'failed' : 'successful'
    },
    collection: {
      DataType: 'String',
      StringValue: payload.record.collection || ''
    }
  }
}

const publishRecordToSNS = async function (topicArn, record, error) {
  const payload = {
    record: record,
    error: error
  }
  return sns.publish({
    Message: JSON.stringify(payload),
    TopicArn: topicArn,
    MessageAttributes: attrsFromPayload(payload)
  }).promise().then(() => {
    logger.info(`Wrote item ${record.id} to ${topicArn}`)
  }).catch((err) => {
    logger.error(`Failed to write item ${record.id} to ${topicArn}: ${err}`)
  })
}

module.exports = publishRecordToSNS
