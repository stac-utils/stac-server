// @ts-nocheck

const opensearch = require('@opensearch-project/opensearch')
const { createAWSConnection: createAWSConnectionOS,
  awsGetCredentials } = require('aws-os-connection')

const AWS = require('aws-sdk')
const elasticsearch = require('@elastic/elasticsearch')
const { createAWSConnection: createAWSConnectionES,
  awsCredsifyAll } = require('@acuris/aws-es-connection')

const logger = console //require('./logger')

const { collectionsIndexConfiguration } = require('../../fixtures/collections')
const { itemsIndexConfiguration } = require('../../fixtures/items')

let _dbClient

function createClientWithUsernameAndPassword(host, username, password) {
  const protocolAndHost = host.split('://')
  return new opensearch.Client({
    node: `${protocolAndHost[0]}://${username}:${password}@${protocolAndHost[1]}`
  })
}

// Connect to a search database instance
async function connect() {
  let client
  const hostConfig = process.env.OPENSEARCH_HOST || process.env.ES_HOST
  const envUsername = process.env.OPENSEARCH_USERNAME
  const envPassword = process.env.OPENSEARCH_PASSWORD
  const secretName = process.env.OPENSEARCH_CREDENTIALS_SECRET_ID

  if (!hostConfig) {
    // use local client
    const config = {
      node: 'http://localhost:9200'
    }
    if (process.env.ES_COMPAT_MODE === 'true') {
      client = new elasticsearch.Client(config)
    } else {
      client = new opensearch.Client(config)
    }
  } else {
    const host = hostConfig.startsWith('http') ? hostConfig : `https://${hostConfig}`

    if (process.env.ES_COMPAT_MODE === 'true') {
      client = awsCredsifyAll(
        new elasticsearch.Client({
          node: host,
          Connection: createAWSConnectionES(AWS.config.credentials)
        })
      )
    } else if (secretName) {
      const secretValue = await new AWS.SecretsManager()
        .getSecretValue({ SecretId: secretName }).promise()
      const { username, password } = JSON.parse(secretValue.SecretString)
      client = createClientWithUsernameAndPassword(host, username, password)
    } else if (envUsername && envPassword) { // fine-grained perms enabled
      client = createClientWithUsernameAndPassword(host, envUsername, envPassword)
    } else { // authenticate with IAM, fine-grained perms not enabled
      client = new opensearch.Client({
        ...createAWSConnectionOS(await awsGetCredentials()),
        node: host
      })
    }
  }

  return client
}

// get existing search database client or create a new one
async function dbClient() {
  if (_dbClient) {
    logger.debug('Using existing search database connection')
  } else {
    _dbClient = await connect()
    logger.debug('Connected to search database')
  }

  return _dbClient
}

async function createIndex(index) {
  const client = await dbClient()
  const exists = await client.indices.exists({ index })
  const indexConfiguration = index === 'collections'
    ? collectionsIndexConfiguration() : itemsIndexConfiguration()
  if (!exists.body) {
    logger.info(`${index} does not exist, creating...`)
    try {
      await client.indices.create({ index, body: indexConfiguration })
      logger.info(`Created index ${index}`)
      logger.debug(`Mapping: ${JSON.stringify(indexConfiguration)}`)
    } catch (error) {
      const debugMessage = `Error creating index ${index}, already created: ${error}`
      logger.debug(debugMessage)
    }
  }
}

module.exports = {
  client: dbClient,
  createIndex,
  connect
}
