const _stream = require('stream')
const through2 = require('through2')
const logger = console //require('./logger')
const esClient = require('./esClient.js')

const COLLECTIONS_INDEX = process.env.COLLECTIONS_INDEX || 'collections'


class ElasticSearchWritableStream extends _stream.Writable {
  constructor(config, options) {
    super(options)
    this.config = config

    this.client = this.config.client
  }

  _destroy() {
    return this.client.close()
  }

  // Allows the flexibility to batch write to multiple indexes.
  transformRecords(chunks) {
    const operations = chunks.reduce((bulkOperations, chunk) => {
      const operation = {}
      const { chunk: record } = chunk
      operation[record.action] = {
        _index: record.index,
        _type: record.type,
        _id: record.id
      }
      if (record.parent) {
        operation[record.action]._parent = record.parent
      }

      bulkOperations.push(operation)
      if (record.action !== 'delete') {
        bulkOperations.push(record.body)
      }
      return bulkOperations
    }, [])
    return operations
  }
  // Write individual records with update/upsert
  async _write(record, enc, next) {
    try {
      const { index, id, body } = record

      // is this needed or will update just fail anyway and move on?
      if (index !== COLLECTIONS_INDEX) {
        // if this isn't a collection check if index exists
        const exists = await this.client.indices.exists({ index })
        if (!exists.body) {
          throw new Error(`Index ${index} does not exist, add before ingesting items`)
        }
      }

      await this.client.update({
        index,
        type: '_doc',
        id,
        body
      })

      logger.debug(`Wrote document ${id}`)

      // if this was a collection, then add a new index with collection name
      if (index === COLLECTIONS_INDEX) {
        await esClient.create_index(id)
      }

      next()
    } catch (err) {
      logger.error(err)
      next()
    }
  }

  // Batch write records, use highWaterMark to set batch size.
  async _writev(records, next) {
    const body = this.transformRecords(records)
    try {
      const result = await this.client.bulk({ body })
      logger.debug(`Result: ${result}`)
      const { errors, items } = result.body
      if (errors) {
        logger.error(items)
      } else {
        logger.debug(`Wrote batch of documents size ${body.length / 2}`)
      }
      next()
    } catch (err) {
      logger.error(err)
      next()
    }
  }
}


// Given an input stream and a transform, write records to an elasticsearch instance
async function stream() {
  let esStreams
  try {
    const client = await esClient.client()

    const toEs = through2.obj({ objectMode: true }, (data, encoding, next) => {
      let index = ''
      logger.debug(`Data: ${JSON.stringify(data)}`)
      if (data && data.hasOwnProperty('extent')) {
        index = COLLECTIONS_INDEX
      } else if (data && data.hasOwnProperty('geometry')) {
        index = data.collection
      } else {
        next()
        return
      }

      // remove any hierarchy links in a non-mutating way
      const hlinks = ['self', 'root', 'parent', 'child', 'collection', 'item', 'items']
      const links = data.links.filter((link) => !hlinks.includes(link.rel))
      const esDataObject = Object.assign({}, data, { links })

      if (data.hasOwnProperty('properties')) {
        esDataObject.properties.created = new Date().toISOString()
        esDataObject.properties.updated = new Date().toISOString()
      }

      // create ES record
      const record = {
        index,
        id: esDataObject.id,
        action: 'update',
        _retry_on_conflict: 3,
        body: {
          doc: esDataObject,
          doc_as_upsert: true
        }
      }
      next(null, record)
    })

    const esStream = new ElasticSearchWritableStream({ client: client }, {
      objectMode: true,
      highWaterMark: Number(process.env.ES_BATCH_SIZE) || 500
    })
    esStreams = { toEs, esStream }
  } catch (error) {
    logger.error(error)
  }
  return esStreams
}


module.exports = stream
