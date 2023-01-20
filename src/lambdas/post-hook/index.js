const winston = require('winston')

const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || 'warn',
  transports: [new winston.transports.Console()],
})

module.exports.handler = async function handler(event, _context) {
  logger.debug(`Event: ${JSON.stringify(event, undefined, 2)}`)

  const result = { ...event }

  if (event.statusCode === 200) {
    const body = JSON.parse(event.body)
    if (body['type'] === 'FeatureCollection') {
      logger.debug('Response is a FeatureCollection')
      // the set result.body to a string of a modified body
      // result.body = JSON.stringify(body)
    } else if (body['type'] === 'Feature') {
      logger.debug('Response is a Feature')
      // the set result.body to a string of a modified body
      // result.body = JSON.stringify(body)
    }
  }

  return result
}
