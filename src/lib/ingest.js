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

  isCollection(item) {
    return item && item.hasOwnProperty('extent')
  }

  isItem(item) {
    return item && item.hasOwnProperty('geometry')
  }

  _toEs(item) {
    // remove any hierarchy links in a non-mutating way
    const hlinks = ElasticSearchIngestClient.hLinkKeys
    const links = item.links.filter((link) => !hlinks.includes(link.rel))
    const esDataObject = { ...item, links }

    if (item.hasOwnProperty('properties')) {
      const now = new Date().toISOString()
      esDataObject.properties.created = now
      esDataObject.properties.updated = now
    }

    return esDataObject
  }

  collectionToEs(collection) {
    logger.debug(`Item: ${JSON.stringify(collection)}`)
    return {
      doc: this._toEs(collection),
      doc_as_upsert: true
    }
  }

  itemToEs(item) {
    logger.debug(`Item: ${JSON.stringify(item)}`)
    const index = item.collection
    if (!this.collections.has(index)) {
      throw new IngestItemError(
        `Index ${index} does not exist, add before ingesting items`
      )
    }

    // create ES operation and record
    return {
      operation: {
        update: {
          retry_on_conflict: 3,
          _index: index,
          _type: 'doc',
          _id: item.id
        }
      },
      body: {
        doc: this._toEs(item),
        doc_as_upsert: true
      }
    }
  }

  async successHandler(item) {
    logger.info(`Ingested ${item.id}`)
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

  async ingestCollection(collection) {
    const index = COLLECTIONS_INDEX
    const id = collection.id
    const body = this.collectionToEs(collection)

    try {
      await this.client.update({
        index,
        type: '_doc',
        id,
        body
      })

      logger.info(`Ingested collection ${id}; attempting to create index`)
      await esClient.createIndex(id)
      logger.info(`Index created for collection ${id}`)
      this.collections.add(id)
    } catch (error) {
      await this.errorHandler(collection, error)
    }
    await this.successHandler(this.addLinks(collection, body.doc))
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

    logger.debug(`Writing batch of documents size ${operations.length / 2}`)
    // run bulk ES query with items
    await this.client.bulk({ body: operations }).then(async (response) => {
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
        logger.info(`${success} of ${items.length} items successfully ingested`)
      })
    })
  }

  async ingest(items) {
    const _items = []
    const promises = []
    const collectionPromises = []
    items.forEach((item) => {
      if (this.isItem(item)) {
        _items.push(item)
      } else if (this.isCollection(item)) {
        // collections we ingest one-by-one because they
        // are limited in quantity and successive items
        // might be dependent on them
        collectionPromises.push(this.ingestCollection(item))
      } else {
        promises.push(this.errorHandler(
          item,
          'Unable to determine item type'
        ))
      }
    })

    await Promise.allSettled(collectionPromises).then(async () => {
      if (_items) {
        await this.ingestItems(_items)
      }
    })
    await Promise.allSettled(promises)
  }
}

const ingest = async function (items, ingestOptions) {
  const ingestClient = await ElasticSearchIngestClient.newClient(
    ingestOptions
  )
  return ingestClient.ingest(items)
}

module.exports = ingest
