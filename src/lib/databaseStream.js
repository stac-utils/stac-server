/* eslint-disable max-len */
import _stream from 'stream'
// @ts-ignore
import through2 from 'through2'
import { dbClient } from './databaseClient.js'

import {
  convertIngestObjectToDbObject,
  writeRecordToDb,
  writeRecordsInBulkToDb,
} from './ingest.js'

import logger from './logger.js'

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

  // Write individual records with update/upsert
  /**
   * @override
   */
  async _write(record, _enc, next) {
    try {
      await writeRecordToDb(record)
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
  async _writev(chunks, next) {
    try {
      const records = chunks.map((/** @type {{ chunk: any; }} */ chunk) => chunk.chunk)
      await writeRecordsInBulkToDb(records)
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
      const record = await convertIngestObjectToDbObject(data)
      if (!record) {
        // @ts-ignore
        next()
        return
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
