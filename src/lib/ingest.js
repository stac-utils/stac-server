import { getItemCreated } from './database.js'
import { addItemLinks, addCollectionLinks } from './api.js'
import { dbClient, createIndex } from './database-client.js'
import logger from './logger.js'
import { publishRecordToSns } from './sns.js'
import { isCollection, isItem, isAction, isStacEntity } from './stac-utils.js'

const COLLECTIONS_INDEX = process.env['COLLECTIONS_INDEX'] || 'collections'

export class InvalidIngestError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidIngestError'
  }
}

const hierarchyLinks = ['self', 'root', 'parent', 'child', 'collection', 'item', 'items']

export async function convertIngestMsgToDbOperation(data) {
  let index
  let action
  logger.debug('data', data)
  if (isCollection(data)) {
    index = COLLECTIONS_INDEX
    action = 'index'
  } else if (isItem(data)) {
    index = data.collection
    action = 'index'
  } else if (isAction(data)) {
    index = data.collection
    action = data.command
  } else {
    throw new InvalidIngestError(
      `Expected 'type' to be 'Collection', 'Feature', or 'action', not '${data.type}'`
    )
  }

  const links = (data.links || []).filter(
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
    action,
    _retry_on_conflict: 3,
    body: dbDataObject
  }
}

export async function executeDbOperation(
  /** @type {{ index: string; id: string; body: {}; action: string}} */ record
) {
  const { index, id, body, action } = record

  if (!index) {
    throw new InvalidIngestError('Index must defined, likely in "collection".')
  }

  const client = await dbClient()

  // is this needed or will update just fail anyway and move on?
  if (index !== COLLECTIONS_INDEX) {
    // if this isn't a collection, check if index exists
    const exists = await client.indices.exists({ index })
    if (!exists.body) {
      throw new InvalidIngestError(`Index ${index} does not exist, add before ingesting items`)
    }
  }

  let result
  if (action === 'index') {
    result = await client.index({
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
  } else if (action === 'truncate') {
    if (process.env['ENABLE_INGEST_ACTION_TRUNCATE'] !== 'true') {
      throw new InvalidIngestError("Command 'truncate' is not enabled")
    }
    if (index === COLLECTIONS_INDEX) {
      throw new InvalidIngestError("Command 'truncate' not allowed on collections index")
    }
    if (index.includes('*')) {
      throw new InvalidIngestError("Command 'truncate' not allowed on * index")
    }

    result = await client.deleteByQuery({
      index,
      body: {
        query: {
          match_all: {}
        }
      },
      refresh: true
    })

    logger.debug(`Truncated index '${index}'`)
  } else {
    throw new InvalidIngestError(`Unknown action '${action}' on '${index}'`)
  }

  return result
}

function logIngestItemsResults(results) {
  results.forEach((result) => {
    if (result.error) {
      if (result.error instanceof InvalidIngestError) {
        // Attempting to ingest invalid stac objects is not a system error so we
        // log it as info and not error
        logger.warn('Invalid ingest item', result.error)
      } else {
        logger.error('Error while ingesting item::', result.error)
      }
    } else {
      logger.debug('Ingested item %j', result)
    }
  })
}

/* eslint-disable no-await-in-loop */

export async function processMessages(msgs) {
  const results = []
  // apply messages one-at-a-time in sequence
  for (const msg of msgs) {
    let dbOp
    let result
    let error
    try {
      dbOp = await convertIngestMsgToDbOperation(msg)
      result = await executeDbOperation(dbOp)
    } catch (e) {
      error = e
    }
    results.push({ record: msg, dbRecord: dbOp, result, error })
  }
  logIngestItemsResults(results)
  return results
}

/* eslint-enable no-await-in-loop */

// Impure - mutates record
function updateLinksAndHrefsWithinRecord(record, assetProxy) {
  const endpoint = process.env['STAC_API_URL']
  if (!endpoint) {
    logger.info('STAC_API_URL not set, not updating links within ingested record')
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
  if (assetProxy.isEnabled()) {
    assetProxy.addProxiedAssets([record], endpoint)
  }
  return record
}

export async function publishResultsToSns(results, topicArn, assetProxy) {
  await Promise.allSettled(results.map(async (result) => {
    if (isStacEntity(result.record)) {
      if (result.record && !result.error) {
        updateLinksAndHrefsWithinRecord(result.record, assetProxy)
      }
      await publishRecordToSns(topicArn, result.record, result.error)
    }
  }))
}
