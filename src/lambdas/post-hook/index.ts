import { APIGatewayProxyResult, Context } from 'aws-lambda'
import logger from '../../lib/logger.js'

export const handler = async (
  event: APIGatewayProxyResult,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  logger.debug('Event: %j', event)

  const result = { ...event }

  if (event.statusCode === 200) {
    const body = JSON.parse(event.body)
    if (body['type'] === 'FeatureCollection') {
      logger.debug('Response is a FeatureCollection')
    } else if (body['type'] === 'Feature') {
      logger.debug('Response is a Feature')
    }
  }

  return result
}
