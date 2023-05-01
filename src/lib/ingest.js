import { Readable } from 'readable-stream'
import pump from 'pump'
import { getItemCreated } from './database.js'
import { dbClient, createIndex } from './databaseClient.js'
import logger from './logger.js'

const COLLECTIONS_INDEX = process.env['COLLECTIONS_INDEX'] || 'collections'

export async function convertIngestObjectToDbObject(
  // eslint-disable-next-line max-len
  /** @type {{ hasOwnProperty: (arg0: string) => any; collection: string; links: any[]; id: any; }} */ data
) {
  let index = ''
  logger.debug('data', data)
  if (data && data.hasOwnProperty('extent')) {
    index = COLLECTIONS_INDEX
  } else if (data && data.hasOwnProperty('geometry')) {
    index = data.collection
  } else {
    return null
  }

  // remove any hierarchy links in a non-mutating way
  const hlinks = ['self', 'root', 'parent', 'child', 'collection', 'item', 'items']
  const links = data.links.filter(
    (/** @type {{ rel: string; }} */ link) => !hlinks.includes(link.rel)
  )
  const dbDataObject = { ...data, links }

  if (data.hasOwnProperty('properties')) {
    const now = (new Date()).toISOString()

    const created = (await getItemCreated(data.collection, data.id)) || now

    // @ts-ignore
    dbDataObject.properties.created = created
    // @ts-ignore
    dbDataObject.properties.updated = now
  }

  return {
    index,
    id: dbDataObject.id,
    action: 'index',
    _retry_on_conflict: 3,
    body: dbDataObject
  }
}

export function combineDbObjectsIntoBulkOperations(records) {
  const operations = records.reduce((/** @type {{}[]} */ bulkOperations, record) => {
    const operation = {}
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

export async function writeRecordToDb(
  /** @type {{ index: string; id: string; body: {}; }} */ record
) {
  const { index, id, body } = record
  const client = await dbClient()

  // is this needed or will update just fail anyway and move on?
  if (index !== COLLECTIONS_INDEX) {
    // if this isn't a collection check if index exists
    const exists = await client.indices.exists({ index })
    if (!exists.body) {
      const msg = `Index ${index} does not exist, add before ingesting items`
      logger.debug(msg)
      throw new Error(msg)
    }
  }

  const result = await client.index({
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
  return result
}

export async function writeRecordsInBulkToDb(records) {
  const body = combineDbObjectsIntoBulkOperations(records)
  const client = await dbClient()
  const result = await client.bulk({ body })
  logger.debug('Result: %j', result)
  const { errors } = result.body
  if (errors) {
    logger.error('Batch write had errors', errors)
  } else {
    logger.debug(`Wrote batch of documents size ${body.length / 2}`)
  }
}

export async function ingestItems(items, stream) {
  const readable = new Readable({ objectMode: true })
  const { toDB, dbStream } = await stream()
  const promise = new Promise((resolve, reject) => {
    pump(
      readable,
      toDB,
      dbStream,
      (error) => {
        if (error) {
          logger.error('Error ingesting', error)
          reject(error)
        } else {
          logger.debug('Ingested item')
          resolve(true)
        }
      }
    )
  })
  items.forEach((item) => readable.push(item))
  readable.push(null)
  return promise
}

export async function ingestItem(item, stream) {
  return ingestItems([item], stream)
}
