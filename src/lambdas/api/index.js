const satlib = require('../../lib')
const logger = console
const httpMethods = require('../../lib/http-methods')

function determineEndpoint(event) {
  let endpoint = process.env.STAC_API_URL
  if (typeof endpoint === 'undefined') {
    if ('X-Forwarded-Host' in event.headers) {
      endpoint = `${event.headers['X-Forwarded-Proto']}://${event.headers['X-Forwarded-Host']}`
    } else {
      endpoint = `${event.headers['X-Forwarded-Proto']}://${event.headers.Host}`
      if ('stage' in event.requestContext) {
        endpoint = `${endpoint}/${event.requestContext.stage}`
      }
    }
  }
  return endpoint
}

function buildRequest(event) {
  const method = event.httpMethod
  let query = {}
  if (method === httpMethods.GET && event.queryStringParameters) {
    query = event.queryStringParameters
  } else if (event.body) {
    query = JSON.parse(event.body)
  }
  return query
}

function buildResponse(statusCode, result) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Required for CORS support to work
      'Access-Control-Allow-Credentials': true
    },
    body: result
  }
}

module.exports.handler = async (event) => {
  logger.debug(`Event: ${JSON.stringify(event)}`)
  const endpoint = determineEndpoint(event)
  const query = buildRequest(event)
  const result = await satlib.api.API(event.path, query, satlib.es, endpoint, event.httpMethod)
  return result instanceof Error
    ? buildResponse(404, result.message)
    : buildResponse(200, JSON.stringify(result))
}
