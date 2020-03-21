'use strict'

const AWS = require('aws-sdk')
const logger = console

// Create an SQS service object
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' })

module.exports.handler = async function handler(event) {
  logger.debug(`Event: ${JSON.stringify(event)}`)

  try {
    let item = event
    if (event.Records && (event.Records[0].EventSource === 'aws:sns')) {
      // event is SNS message
      item = JSON.parse(event.Records[0].Sns.Message)
    }
    logger.debug(`Item: ${JSON.stringify(item)}`)

    // Is Item OR Collection
    if ((item.type && item.type === 'Feature') || (item.id && item.extent)) {
      // get queue URL from ARN
      let resp = await sqs.getQueueUrl({ QueueName: process.env.queueName }).promise()

      const queue_url = resp.QueueUrl
      // add to queue
      const params = {
        MessageBody: JSON.stringify(item),
        QueueUrl: queue_url
      }
      resp = await sqs.sendMessage(params).promise()
      logger.info(`Added to queue ${queue_url}`)
    }
  } catch (error) {
    logger.log(error)
  }
}

