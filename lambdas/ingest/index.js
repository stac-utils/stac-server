'use strict'

const satlib = require('../../libs')
const logger = console


module.exports.handler = async function handler(event) {
  logger.info(`Event: ${JSON.stringify(event)}`)
  try {
    if (event.Records) {
      const records = await Promise.all(event.Records.map((record) => {
        const item = JSON.parse(record.body)
        satlib.ingest.ingestItem(item, satlib.es)
        logger.log(`Ingested ${item.id}`)
      }))
    }
  } catch (error) {
    console.log(error)
  }
}

