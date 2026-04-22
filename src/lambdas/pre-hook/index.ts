import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'

const TTL = 60 * 1000 // in ms

const response401 = {
  statusCode: 401,
  body: '',
  headers: { 'access-control-allow-origin': '*' },
}

let apiKeys = new Map()

export const getApiKeys = () => apiKeys

const updateApiKeys = async () => {
  await new SecretsManagerClient({ region: process.env['AWS_REGION'] || 'us-west-2' })
    .send(
      new GetSecretValueCommand({
        SecretId: process.env['API_KEYS_SECRET_ID'],
      })
    )
    .then((data) => {
      apiKeys = new Map(Object.entries(JSON.parse(data.SecretString || '')))
    })
    .catch((error) => {
      console.error(
        `Error updating API keys: ${JSON.stringify(error, undefined, 2)}`
      )
    })
    .finally(() => {
      setTimeout(() => updateApiKeys(), TTL)
    })
}

const isValidToken = (
  token: string | undefined
) => (apiKeys.get(token) || []).includes('write')

export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyEvent | APIGatewayProxyResult> => {
  let token: string | undefined

  if (event.headers && event.headers['Authorization']) {
    token = event.headers['Authorization'].split('Bearer ')[1]
  } else if (
    event.queryStringParameters
    && event.queryStringParameters['auth_token']
  ) {
    token = event.queryStringParameters['auth_token']
  }

  if (!apiKeys.size) {
    await updateApiKeys()
  }

  if (isValidToken(token)) {
    return event
  }

  return response401
}
