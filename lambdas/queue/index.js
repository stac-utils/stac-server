'use strict'

const logger = console


module.exports.handler = async function handler(event) {
  logger.debug(`Event: ${JSON.stringify(event)}`)

  try {
    let item = event
    if (event.Records && (event.Records[0].EventSource === 'aws:sns')) {
      // event is SNS message
      item = JSON.parse(event.Records[0].Sns.Message)
    }

    // Is Item OR Collection
    if ((item.type && item.type === 'Feature') || (item.id && item.extent)) {
      // TODO - add to queue
    }
  } catch (error) {
    console.log(error)
  }
}

