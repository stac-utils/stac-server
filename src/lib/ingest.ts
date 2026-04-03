// convert to ts further along in migration

import { ApiResponse } from '@opensearch-project/opensearch'
import { getItemCreated, collectionUniqueIndexID } from './database.js'
import { addItemLinks, addCollectionLinks } from './api.js'
import { dbClient, createIndex } from './database-client.js'
import logger from './logger.js'
import { publishRecordToSns } from './sns.js'
import { isCollection, isItem, isAction, isStacEntity } from './stac-utils.js'
import { ApiRecord, DbOperation, DbOperationResult, StacRecord } from './types.js'
import { AssetProxy } from './asset-proxy.js'

const COLLECTIONS_INDEX = process.env['COLLECTIONS_INDEX'] || 'collections'

export class InvalidIngestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidIngestError'
  }
}

const hierarchyLinks = ['self', 'root', 'parent', 'child', 'collection', 'item', 'items']

export async function convertIngestMsgToDbOperation(data: ApiRecord): Promise<DbOperation> {
  logger.debug('data', data)

  const links = isStacEntity(data)
    ? (data.links || []).filter(
      (link) => !hierarchyLinks.includes(link.rel)
    )
    : []
  if (isCollection(data)) {
    return {
      index: COLLECTIONS_INDEX,
      action: 'index',
      id: data.id,
      _retry_on_conflict: 3,
      body: { ...data, links }
    }
  } if (isItem(data)) {
    const now = (new Date()).toISOString()
    const created = (await getItemCreated(data.collection, data.id)) || now
    const body = {
      ...data,
      links,
      properties: {
        ...data.properties,
        created,
        updated: now
      }
    }
    return {
      index: collectionUniqueIndexID(data.collection),
      id: data.id,
      action: 'index',
      _retry_on_conflict: 3,
      body
    }
  } if (isAction(data)) {
    return {
      index: collectionUniqueIndexID(data.collection),
      id: undefined,
      action: data.command,
      _retry_on_conflict: 3,
      body: data
    }
  }
  throw new InvalidIngestError(
    `Expected 'type' to be 'Collection', 'Feature', or 'action'.
    Input was '${JSON.stringify(data)}'`
  )
}

export async function executeDbOperation(
  dbOp: DbOperation
): Promise<ApiResponse> {
  const { index, id, body, action } = dbOp

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
      id,
      body
    })

    logger.debug(`Wrote document ${id}`)

    // if this was a collection, then add a new index with collection name
    if (index === COLLECTIONS_INDEX) {
      const itemIndex = collectionUniqueIndexID(id)
      await createIndex(itemIndex)
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

function logIngestItemsResults(results: DbOperationResult[]) {
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

export async function processMessages(msgs: ApiRecord[]): Promise<DbOperationResult[]> {
  const results: DbOperationResult[] = []
  // apply messages one-at-a-time in sequence
  for (const msg of msgs) {
    let dbOp: DbOperation | undefined
    let result: ApiResponse | undefined
    let error: Error | undefined
    try {
      dbOp = await convertIngestMsgToDbOperation(msg)
      result = await executeDbOperation(dbOp)
      results.push({ record: msg, dbRecord: dbOp, result, error: undefined })
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e))
      results.push({ record: msg, dbRecord: dbOp, result: undefined, error })
    }
  }
  logIngestItemsResults(results)
  return results
}

/* eslint-enable no-await-in-loop */

// Impure - mutates record
function updateLinksAndHrefsWithinRecord(record: StacRecord, assetProxy: AssetProxy): StacRecord {
  const endpoint = process.env['STAC_API_URL']
  if (!endpoint) {
    logger.info('STAC_API_URL not set, not updating links within ingested record')
    return record
  }

  record.links = record.links.filter(
    (link) => !hierarchyLinks.includes(link.rel)
  )
  if (isItem(record)) {
    addItemLinks([record], endpoint)
  } else if (isCollection(record)) {
    addCollectionLinks([record], endpoint)
  }
  assetProxy.updateAssetHrefs([record], endpoint)
  return record
}

export async function publishResultsToSns(
  results: DbOperationResult[],
  topicArn: string,
  assetProxy: AssetProxy
): Promise<void> {
  await Promise.allSettled(results.map(async (result) => {
    if (isStacEntity(result.record)) {
      if (result.record && !result.error) {
        updateLinksAndHrefsWithinRecord(result.record, assetProxy)
      }
      await publishRecordToSns(topicArn, result.record, result.error?.message)
    }
  }))
}
