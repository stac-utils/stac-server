/* eslint-disable max-len */
import _stream from 'stream'
// @ts-ignore
import through2 from 'through2'
import { dbClient, createIndex } from './databaseClient.js'

import { getItemCreated } from './database.js'

const logger = console

const COLLECTIONS_INDEX = process.env['COLLECTIONS_INDEX'] || 'collections'

class SearchDatabaseWritableStream extends _stream.Writable {
  /**
   * @param {{ client: any; }} config
   * @param {_stream.WritableOptions | undefined} options
   */
  constructor(config, options) {
    super(options)
    this.config = config

    this.client = this.config.client
  }

  // Allows the flexibility to batch write to multiple indexes.
  transformRecords(chunks) {
    const operations = chunks.reduce((/** @type {{}[]} */ bulkOperations,
      /** @type {{ chunk: any; }} */ chunk) => {
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
  /**
   * @override
   */
  async _write(record, _enc, next) {
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
        await createIndex(id)
      }

      return next()
    } catch (err) {
      logger.error(err)
      return next(err)
    }
  }

  // Batch write records, use highWaterMark to set batch size.
  /**
   * @override
   */
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

    const toDB = through2.obj({ objectMode: true }, async (
      /** @type {{ hasOwnProperty: (arg0: string) => any; collection: string; links: any[]; id: any; }} */ data,
      // @ts-ignore
      /** @type {any} */ encoding,
      /** @type {(arg0: null | undefined, arg1: { index: string; id: any; action: string; _retry_on_conflict: number; body: any; } | undefined) => void} */ next
    ) => {
      let index = ''
      logger.debug(`Data: ${JSON.stringify(data)}`)
      if (data && data.hasOwnProperty('extent')) {
        index = COLLECTIONS_INDEX
      } else if (data && data.hasOwnProperty('geometry')) {
        index = data.collection
      } else {
        // @ts-ignore
        next()
        return
      }

      // remove any hierarchy links in a non-mutating way
      const hlinks = ['self', 'root', 'parent', 'child', 'collection', 'item', 'items']
      const links = data.links.filter((/** @type {{ rel: string; }} */ link) => !hlinks.includes(link.rel))
      const dbDataObject = { ...data, links }

      if (data.hasOwnProperty('properties')) {
        const now = (new Date()).toISOString()

        const created = (await getItemCreated(data.collection, data.id)) || now

        // @ts-ignore
        dbDataObject.properties.created = created
        // @ts-ignore
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
      highWaterMark: Number(process.env['INGEST_BATCH_SIZE'] || process.env['ES_BATCH_SIZE']) || 500
    })
    dbStreams = { toDB, dbStream }
  } catch (error) {
    logger.error(error)
  }
  return dbStreams
}
