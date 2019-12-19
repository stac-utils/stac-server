'use strict'

const satlib = require('../../libs')
const logger = console


module.exports.handler = async function handler(event) {
  logger.debug(`Event: ${JSON.stringify(event)}`)
  try {
    if (event.Records) {
      logger.info(`Ingesting ${event.Records.length} items`)
      const items = await Promise.all(event.Records.map(async (record) => {
        const item = JSON.parse(record.body)
        await satlib.ingest.ingestItem(item, satlib.es)
        return item
      }))
      logger.debug(`Items: ${JSON.stringify(items)}`)
    }
  } catch (error) {
    console.log(error)
  }
}

