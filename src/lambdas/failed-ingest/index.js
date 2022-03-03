const logger = console

module.exports.handler = async function handler(event) {
  logger.info(`Failed ingest: ${JSON.stringify(event)}`)
  // log each incoming SNS message
  if (event.Records) {
    let msg
    event.Records.forEach((record) => {
      msg = JSON.parse(record.body)
      if (msg.hasOwnProperty('Message')) {
        msg = JSON.parse(msg.Message)
      }
      logger.info(JSON.stringify(msg))
    })
  }
}
