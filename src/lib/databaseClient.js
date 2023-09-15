import { Client } from '@opensearch-project/opensearch'
import { createAWSConnection as createAWSConnectionOS, awsGetCredentials } from 'aws-os-connection'

import AWS from 'aws-sdk'

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
      node: 'http://localhost:9200'
    }
    client = new Client(config)
  } else {
    const host = hostConfig.startsWith('http') ? hostConfig : `https://${hostConfig}`

    if (secretName) {
      const secretValue = await new AWS.SecretsManager()
        .getSecretValue({ SecretId: secretName }).promise()
      const { username, password } = JSON.parse(secretValue.SecretString || '')
      client = createClientWithUsernameAndPassword(host, username, password)
    } else if (envUsername && envPassword) {
      client = createClientWithUsernameAndPassword(host, envUsername, envPassword)
    } else {
      // authenticate with IAM, fine-grained perms not enabled
      client = new Client({
        ...createAWSConnectionOS(await awsGetCredentials()),
        node: host
      })
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
      logger.debug(`Error creating index '${index}'`, error)
    }
  }
}
