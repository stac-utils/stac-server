import { Client } from '@opensearch-project/opensearch'

// eslint-disable-next-line import/no-unresolved
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws'
import { defaultProvider } from '@aws-sdk/credential-provider-node'
import { SecretsManager, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

import collectionsIndexConfiguration from '../../fixtures/collections.js'
import itemsIndexConfiguration from '../../fixtures/items.js'
import logger from './logger.js'

let _dbClient

function createClientWithUsernameAndPassword(host, username, password) {
  const protocolAndHost = host.split('://')
  return new Client({
    node: `${protocolAndHost[0]}://${username}:${password}@${protocolAndHost[1]}`
  })
}

function createClientWithAwsAuth(host) {
  return new Client({
    ...AwsSigv4Signer({
      region: process.env['AWS_REGION'] || 'us-west-2',
      service: host.endsWith('aoss.amazonaws.com') ? 'aoss' : 'es',
      getCredentials: () => defaultProvider()(),
    }),
    node: host
  })
}

// Connect to a search database instance
export async function connect() {
  let client
  const hostConfig = process.env['OPENSEARCH_HOST'] || process.env['ES_HOST']
  const envUsername = process.env['OPENSEARCH_USERNAME']
  const envPassword = process.env['OPENSEARCH_PASSWORD']
  const secretName = process.env['OPENSEARCH_CREDENTIALS_SECRET_ID']

  if (!hostConfig) {
    // use local client
    const config = {
      node: 'http://127.0.0.1:9200'
    }
    client = new Client(config)
  } else {
    const host = hostConfig.startsWith('http') ? hostConfig : `https://${hostConfig}`

    if (secretName) {
      const secretValue = await new SecretsManager({}).send(
        new GetSecretValueCommand({ SecretId: secretName })
      )
      const { username, password } = JSON.parse(secretValue.SecretString || '')
      client = createClientWithUsernameAndPassword(host, username, password)
    } else if (envUsername && envPassword) {
      client = createClientWithUsernameAndPassword(host, envUsername, envPassword)
    } else {
      client = createClientWithAwsAuth(host)
    }
  }

  return client
}

// get existing search database client or create a new one
export async function dbClient() {
  if (_dbClient) {
    logger.debug('Using existing search database connection')
  } else {
    _dbClient = await connect()
    logger.debug('Connected to search database')
  }

  return _dbClient
}

export async function createIndex(index) {
  const client = await dbClient()
  const exists = await client.indices.exists({ index })
  if (!exists.body) {
    logger.info(`${index} does not exist, creating...`)
    const indexConfiguration = index === 'collections'
      ? collectionsIndexConfiguration() : itemsIndexConfiguration()
    try {
      await client.indices.create({ index, body: indexConfiguration })
      logger.info(`Created index ${index}`)
      logger.debug('Mapping: %j', indexConfiguration)
    } catch (error) {
      logger.error(`Error creating index '${index}'`, error)
      throw error
    }
  } else {
    logger.error(`${index} already exists.`)
  }
}
