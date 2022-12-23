// @ts-nocheck

module.exports.handler = async function handler(event, context) {
  const { logger = console } = context

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
