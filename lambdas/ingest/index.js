'use strict'

const satlib = require('../../libs')
const logger = console


module.exports.handler = async function handler(event) {
  logger.debug(`Event: ${JSON.stringify(event)}`)
  if (event.create_indices) {
    await satlib.es.create_indices()
  }
  try {
    if (event.Records) {
      logger.info(`Ingesting ${event.Records.length} items`)
      const items = await Promise.all(event.Records.map(async (record) => {
        const item = JSON.parse(record.body)
        logger.debug(`Item: ${JSON.stringify(item)}`)
        return item
      }))
      await satlib.ingest.ingestItems([item], satlib.es)
      logger.debug(`${items.length} Items: ${JSON.stringify(items)}`)
    }
  } catch (error) {
    console.log(error)
    throw(error)
  }
}

