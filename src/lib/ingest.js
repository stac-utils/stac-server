const esClient = require('./esClient')
const IngestItemError = require('./IngestItemError')
const { addCollectionLinks, addItemLinks } = require('./api')
const logger = console

const COLLECTIONS_INDEX = process.env.COLLECTIONS_INDEX || 'collections'
const H_LINK_KEYS = [
  'self',
  'root',
  'parent',
  'child',
  'collection',
  'item',
  'items'
]

class ElasticSearchIngestClient {
  constructor(config) {
    this.config = config || {}
    this.collections = []
    if (!this.config.endpoint) {
      logger.warn(
        'No endpoint url defined, unable to replace URLs in successful items'
      )
    }
  }

  static async newClient(config) {
    const client = new ElasticSearchIngestClient(config)
    try {
      await client.initClient()
    } catch (err) {
      logger.error(
        `Failed to initalize ElasticSearchIngestClient: ${JSON.stringify(err)}`
      )
      throw err
    }
    return client
  }

  async initClient() {
    this.client = await esClient.client()
    await this.updateCollections()
  }

  async updateCollections() {
    const indexResp = await this.client.cat.indices({
      format: 'json',
      h: 'index'
    })

    this.collections = new Set(indexResp.body.map((index) => index.index))
  }

  addLinks(originalRecord, convertedRecord) {
    // convertedRecord has properties modified by itemToES,
    // so we want to use it for the post-ingest handlers.
    // However, it has the links stripped, so if the endpoint
    // is not defined we need to get the links off the original
    // because we can't use add links functions without the endpoint.
    if (!this.config.endpoint) {
      convertedRecord.links = originalRecord.links
      return convertedRecord
    }

    let record = convertedRecord
    if (convertedRecord.type === 'Feature') {
      record = addItemLinks([convertedRecord], this.config.endpoint)[0]
    } else if (convertedRecord.type === 'Collection') {
      record = addCollectionLinks([convertedRecord], this.config.endpoint)[0]
    } else {
      logger.warn(`Cannot add links: unknown record type '${convertedRecord.type}'`)
    }
    return record
  }

  static get hLinkKeys() {
    return H_LINK_KEYS
  }

  itemToEs(item) {
    let index = ''
    logger.debug(`Item: ${JSON.stringify(item)}`)
    // Question: can't we look for the item type here? Collection vs Feature?
    if (item && item.hasOwnProperty('extent')) {
      index = COLLECTIONS_INDEX
    } else if (item && item.hasOwnProperty('geometry')) {
      if (!this.collections.has(item.collection)) {
        throw new IngestItemError(
          `Index ${item.collection} does not exist, add before ingesting items`
        )
      }
      index = item.collection
    } else {
      throw new IngestItemError('Unable to determine item type to assign index')
    }

    // remove any hierarchy links in a non-mutating way
    const hlinks = ElasticSearchIngestClient.hLinkKeys
    const links = item.links.filter((link) => !hlinks.includes(link.rel))
    const esDataObject = { ...item, links }

    if (item.hasOwnProperty('properties')) {
      const now = new Date().toISOString()
      esDataObject.properties.created = now
      esDataObject.properties.updated = now
    }

    // create ES operation and record
    return {
      operation: {
        update: {
          _index: index,
          _type: 'doc',
          _id: esDataObject.id
        }
      },
      body: {
        doc: esDataObject,
        doc_as_upsert: true
      }
    }
  }

  async successHandler(item) {
    // if this was a collection, then add a new index with collection name
    if (item.type === 'Collection') {
      logger.info(`Ingested collection ${item.id}; attempting to create index`)
      try {
        await esClient.createIndex(item.id)
      } catch (err) {
        logger.error(`Failed to create index for collection ${item.id}`)
        await this.errorHandler(item, err)
        return
      }
      this.collections.add(item.id)
      logger.info(`Index created for collection ${item.id}`)
    } else {
      logger.info(`Ingested ${item.id}`)
    }

    if (this.config.successHandler) {
      try {
        await this.config.successHandler(item)
      } catch (err) {
        logger.error(`Ingest success hander failed: ${JSON.stringify(err)}`)
      }
    }
  }

  async errorHandler(item, error) {
    logger.error(`Error ingesting ${item.id}: ${JSON.stringify(error)}`)
    if (this.config.errorHandler) {
      try {
        await this.config.errorHandler(item, error)
      } catch (err) {
        logger.error(`Ingest error hander failed: ${JSON.stringify(err)}`)
      }
    }
  }

  async ingestItems(items) {
    const promises = []

    // prepare items for ES query
    const itemsById = {}
    const operations = []
    items.forEach((item) => {
      try {
        const { operation, body } = this.itemToEs(item)
        itemsById[item.id] = {
          original: item,
          converted: body.doc
        }
        operations.push(operation)
        operations.push(body)
      } catch (err) {
        if (err instanceof IngestItemError) {
          promises.push(this.errorHandler(item, err.message))
        } else {
          throw err
        }
      }
    })

    if (operations.length === 0) {
      logger.warn('No items remaining to be ingested')
      return
    }

    // run bulk ES query with items
    const response = await this.client.bulk({
      body: operations
    })
    const esRespItems = response.body.items
    logger.debug(`Wrote batch of documents size ${operations.length / 2}`)

    // process ES response, handling successes and errors
    let success = 0
    esRespItems.forEach((esRespItem) => {
      const esItem = esRespItem[(Object.keys(esRespItem)[0])]
      const { original, converted } = itemsById[esItem._id]
      if (esItem.error) {
        promises.push(this.errorHandler(original, esItem.error))
      } else {
        success += 1
        promises.push(this.successHandler(this.addLinks(original, converted)))
      }
    })
    await Promise.allSettled(promises).then(() => {
      logger.info(`${success} of ${items.length} successfully ingested`)
    })
  }
}

const ingest = async function (items, ingestOptions) {
  const ingestClient = await ElasticSearchIngestClient.newClient(
    ingestOptions
  )
  return ingestClient.ingestItems(items)
}

module.exports = ingest
