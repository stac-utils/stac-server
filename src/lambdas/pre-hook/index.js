// @ts-nocheck

export default async function handler(event, context) {
  const { logger = console } = context

  logger.debug(`Event: ${JSON.stringify(event, undefined, 2)}`)

  const authTokenValue = process.env['PRE_HOOK_AUTH_TOKEN']
  const authTokenTxnValue = process.env['PRE_HOOK_AUTH_TOKEN_TXN']
  const txnEnabled = process.env['ENABLE_TRANSACTIONS_EXTENSION'] === 'true'

  if (!authTokenValue || (txnEnabled && !authTokenTxnValue)) {
    return {
      statusCode: 500,
      body: 'auth token(s) are not configured'
    }
  }

  let token = null

  const authHeader = event.headers['Authorization']

  if (authHeader) {
    token = authHeader.split('Bearer ')[1]
  } else if (event.queryStringParameters) {
    token = event.queryStringParameters['auth_token']
  } else {
    return {
      statusCode: 401,
      body: '',
      headers: { 'access-control-allow-origin': '*' }
    }
  }

  if (event.httpMethod !== 'GET' && event.path.startsWith('/collections')) {
    if (token === authTokenTxnValue) {
      return event
    }
  } else if (token === authTokenValue || token === authTokenTxnValue) {
    return event
  }

  return {
    statusCode: 403,
    body: ''
  }
}
