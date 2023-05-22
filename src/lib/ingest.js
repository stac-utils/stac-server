import { getItemCreated } from './database.js'
import { addItemLinks, addCollectionLinks } from './api.js'
import { dbClient, createIndex } from './databaseClient.js'
import logger from './logger.js'
import { publishRecordToSns } from './sns.js'
import { isCollection, isItem } from './stac-utils.js'

const COLLECTIONS_INDEX = process.env['COLLECTIONS_INDEX'] || 'collections'

export class InvalidIngestError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidIngestError'
  }
}

const hierarchyLinks = ['self', 'root', 'parent', 'child', 'collection', 'item', 'items']

export async function convertIngestObjectToDbObject(
  // eslint-disable-next-line max-len
  /** @type {{ hasOwnProperty: (arg0: string) => any; type: string, collection: string; links: any[]; id: any; }} */ data
) {
  let index = ''
  logger.debug('data', data)
  if (isCollection(data)) {
    index = COLLECTIONS_INDEX
  } else if (isItem(data)) {
    index = data.collection
  } else {
    throw new InvalidIngestError(
      `Expeccted data.type to be "Collection" or "Feature" not ${data.type}`
    )
  }

  // remove any hierarchy links in a non-mutating way
  if (!data.links) {
    throw new InvalidIngestError('Expected a "links" proporty on the stac object')
  }
  const links = data.links.filter(
    (/** @type {{ rel: string; }} */ link) => !hierarchyLinks.includes(link.rel)
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
      throw new InvalidIngestError(`Index ${index} does not exist, add before ingesting items`)
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

function logIngestItemsResults(results) {
  results.forEach((result) => {
    if (result.error) {
      if (result.error instanceof InvalidIngestError) {
        // Attempting to ingest invalid stac objects is not a system error so we
        // log it as info and not error
        logger.info('Invalid ingest item', result.error)
      } else {
        logger.error('Error while ingesting item', result.error)
      }
    } else {
      logger.debug('Ingested item %j', result)
    }
  })
}

export async function ingestItems(items) {
  const results = []
  for (const record of items) {
    let dbRecord
    let result
    let error
    try {
      // We are intentionally writing records one at a time in sequence so we
      // disable this rule
      // eslint-disable-next-line no-await-in-loop
      dbRecord = await convertIngestObjectToDbObject(record)
      // eslint-disable-next-line no-await-in-loop
      result = await writeRecordToDb(dbRecord)
    } catch (e) {
      error = e
    }
    results.push({ record, dbRecord, result, error })
  }
  logIngestItemsResults(results)
  return results
}

// Impure - mutates record
function updateLinksWithinRecord(record) {
  const endpoint = process.env['STAC_API_URL']
  if (!endpoint) {
    logger.info('STAC_API_URL not set, not updating links within ingested record')
    return record
  }
  if (!isItem(record) && !isCollection(record)) {
    logger.info('Record is not a collection or item, not updating links within ingested record')
    return record
  }

  record.links = record.links.filter(
    (/** @type {{ rel: string; }} */ link) => !hierarchyLinks.includes(link.rel)
  )
  if (isItem(record)) {
    addItemLinks([record], endpoint)
  } else if (isCollection(record)) {
    addCollectionLinks([record], endpoint)
  }
  return record
}

export function publishResultsToSns(results, topicArn) {
  results.forEach(async (result) => {
    if (result.record && !result.error) {
      updateLinksWithinRecord(result.record)
    }
    await publishRecordToSns(topicArn, result.record, result.error)
  })
}
