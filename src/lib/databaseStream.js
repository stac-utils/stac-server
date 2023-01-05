import _stream from 'stream'
import through2 from 'through2'
import { dbClient } from './databaseClient.js'

import { getItemCreated } from './database.js'

const logger = console

const COLLECTIONS_INDEX = process.env.COLLECTIONS_INDEX || 'collections'

class SearchDatabaseWritableStream extends _stream.Writable {
  constructor(config, options) {
    super(options)
    this.config = config

    this.client = this.config.client
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
          const msg = `Index ${index} does not exist, add before ingesting items`
          logger.debug(msg)
          return next(
            new Error(msg)
          )
        }
      }

      await this.client.index({
        index,
        type: '_doc',
        id,
        body
      })

      logger.debug(`Wrote document ${id}`)

      // if this was a collection, then add a new index with collection name
      if (index === COLLECTIONS_INDEX) {
        (await dbClient()).createIndex(id)
      }

      return next()
    } catch (err) {
      logger.error(err)
      return next(err)
    }
  }

  // Batch write records, use highWaterMark to set batch size.
  async _writev(records, next) {
    const body = this.transformRecords(records)
    try {
      const result = await this.client.bulk({ body })
      logger.debug(`Result: ${JSON.stringify(result, undefined, 2)}`)
      const { errors } = result.body
      if (errors) {
        logger.error(`Batch write had errors: ${JSON.stringify(errors)}`)
      } else {
        logger.debug(`Wrote batch of documents size ${body.length / 2}`)
      }
      next()
    } catch (err) {
      logger.error(err)
      next(err)
    }
  }
}

// Given an input stream and a transform, write records to a search database instance
export default async function stream() {
  let dbStreams
  try {
    const client = await dbClient()

    const toDB = through2.obj({ objectMode: true }, async (data, encoding, next) => {
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
      const dbDataObject = { ...data, links }

      if (data.hasOwnProperty('properties')) {
        const now = (new Date()).toISOString()

        const created = (await getItemCreated(data.collection, data.id)) || now

        dbDataObject.properties.created = created
        dbDataObject.properties.updated = now
      }

      // create ES record
      const record = {
        index,
        id: dbDataObject.id,
        action: 'index',
        _retry_on_conflict: 3,
        body: dbDataObject
      }

      next(null, record)
    })

    const dbStream = new SearchDatabaseWritableStream({ client: client }, {
      objectMode: true,
      highWaterMark: Number(process.env.INGEST_BATCH_SIZE || process.env.ES_BATCH_SIZE) || 500
    })
    dbStreams = { toDB, dbStream }
  } catch (error) {
    logger.error(error)
  }
  return dbStreams
}
