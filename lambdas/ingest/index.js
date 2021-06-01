'use strict'
const esClient = require('../../libs/esClient.js')
const stream = require('../../libs/esStream.js')
const ingest = require('../../libs/ingest.js')
const logger = console

module.exports.handler = async function handler(event) {
  logger.debug(`Event: ${JSON.stringify(event)}`)
  if (event.create_indices) {
    await esClient.create_index('collections')
    //await satlib.es.create_index('items')
  }

  // start with message as is
  let items = [event]
  // if this is SQS
  if (event.Records) {
    items = await Promise.all(event.Records.map(async (record) => {
      let i = JSON.parse(record.body)
      // if event record is an SNS notification
      if (i.Type === 'Notification') {
        i = JSON.parse(i.Message)
      }
      logger.debug(`Record: ${JSON.stringify(i)}`)
      return i
    }))
  }

  try {
    await ingest.ingestItems(items, stream)
    logger.info(`Ingested ${items.length} Items: ${JSON.stringify(items)}`)
  } catch (error) {
    console.log(error)
    throw (error)
  }
}
