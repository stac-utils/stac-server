'use strict'

const AWS = require('aws-sdk')
const { createAWSConnection, awsCredsifyAll } = require('@acuris/aws-es-connection')
const elasticsearch = require('@elastic/elasticsearch')
const logger = console //require('./logger')

const collectionsMapping = require('../../fixtures/collections')
const itemsMapping = require('../../fixtures/items')

let _esClient

// Connect to an Elasticsearch instance
async function connect() {
  let esConfig
  let client

  // use local client
  if (!process.env.ES_HOST) {
    esConfig = {
      node: 'http://localhost:9200'
    }
    client = new elasticsearch.Client(esConfig)
  } else {
    //const awsCredentials = await awsGetCredentials()
    const AWSConnector = createAWSConnection(AWS.config.credentials)
    let esHost = process.env.ES_HOST
    if (!esHost.startsWith('http')) {
      esHost = `https://${process.env.ES_HOST}`
    }
    client = awsCredsifyAll(
      new elasticsearch.Client({
        node: esHost,
        Connection: AWSConnector
      })
    )
  }

  const health = await client.cat.health()
  logger.debug(`Health: ${JSON.stringify(health)}`)

  return client
}

// get existing ES client or create a new one
async function esClient() {
  if (_esClient) {
    logger.debug('Using existing Elasticsearch connection')
  } else {
    _esClient = await connect()
    logger.debug('Connected to Elasticsearch')
  }

  return _esClient
}

async function createIndex(index) {
  const client = await esClient()
  const exists = await client.indices.exists({ index })
  const mapping = index === 'collections' ? collectionsMapping : itemsMapping
  if (!exists.body) {
    logger.info(`${index} does not exist, creating...`)
    try {
      await client.indices.create({ index, body: mapping })
      logger.info(`Created index ${index}`)
      logger.debug(`Mapping: ${JSON.stringify(mapping)}`)
    } catch (error) {
      const debugMessage = `Error creating index ${index}, already created: ${error}`
      logger.debug(debugMessage)
    }
  }
}

module.exports = {
  client: esClient,
  createIndex,
  connect
}
