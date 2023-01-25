// ts-check
/* eslint-disable import/prefer-default-export */
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'

const TTL = 60 * 1000 // in ms

const response401 = {
  statusCode: 401,
  body: '',
  headers: { 'access-control-allow-origin': '*' },
}

// eslint-disable-next-line import/no-mutable-exports
export let apiKeys = new Map()

const updateApiKeys = async () => {
  await new SecretsManagerClient({ region: process.env['AWS_REGION'] })
    .send(
      new GetSecretValueCommand({
        SecretId: process.env['API_KEYS_SECRET_ID'],
      })
    )
    .then((data) => {
      apiKeys = new Map(Object.entries(JSON.parse(data.SecretString)))
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

const READ = ['read']
const isValidReadToken = (token) => READ.includes(apiKeys.get(token))

export const handler = async (event, _context) => {
  let token = null

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

  if (isValidReadToken(token)) {
    return event
  }

  return response401
}
