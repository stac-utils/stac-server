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

async function asyncMapInSequence(objects, asyncFn) {
  const results = []
  for (const object of objects) {
    try {
      // This helper is inteneted to be used with the objects must be processed
      // in sequence so we intentionally await each iteration.
      // eslint-disable-next-line no-await-in-loop
      const result = await asyncFn(object)
      results.push(result)
    } catch (error) {
      results.push(error)
    }
  }
  return results
}

function logErrorResults(results) {
  results.forEach((result) => {
    if (result instanceof Error) {
      logger.error('Error while ingesting item', result)
    }
  })
}

export async function ingestItems(items) {
  const records = await asyncMapInSequence(items, convertIngestObjectToDbObject)
  const results = await asyncMapInSequence(records, writeRecordToDb)
  logErrorResults(results)
  return results
}
