'use strict'

const satlib = require('../../libs')
const logger = console


module.exports.handler = async function handler(event) {
  logger.info(`Event: ${JSON.stringify(event)}`)
  try {
    if (event.Records) {
      const items = await Promise.all(event.Records.map(async (record) => {
        const item = JSON.parse(record.body)
        await satlib.ingest.ingestItem(item, satlib.es)
        logger.log(`Ingested ${item.id}`)
        return item
      }))
      logger.info(`Items: ${items}`)
    }
  } catch (error) {
    console.log(error)
  }
}

