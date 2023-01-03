import { dbClient as _client, createIndex } from './databaseClient.js'

const logger = console //require('./logger')

const COLLECTIONS_INDEX = process.env.COLLECTIONS_INDEX || 'collections'
const DEFAULT_INDICES = ['*', '-.*', '-collections']

let collectionToIndexMapping = null
let unrestrictedIndices = null

export const isIndexNotFoundError = (e) => (
  e instanceof Error
    && e.name === 'ResponseError'
    && e.message.includes('index_not_found_exception'))

/*
This module is used for connecting to a search database instance, writing records,
searching records, and managing the indexes. It looks for the OPENSEARCH_HOST environment
variable which is the URL to the search database host
*/

function buildRangeQuery(property, operators, operatorsObject) {
  const gt = 'gt'
  const lt = 'lt'
  const gte = 'gte'
  const lte = 'lte'
  const comparisons = [gt, lt, gte, lte]
  let rangeQuery
  if (operators.includes(gt) || operators.includes(lt)
         || operators.includes(gte) || operators.includes(lte)) {
    const propertyKey = `properties.${property}`
    rangeQuery = {
      range: {
        [propertyKey]: {
        }
      }
    }
    // All operators for a property go in a single range query.
    comparisons.forEach((comparison) => {
      if (operators.includes(comparison)) {
        const existing = rangeQuery.range[propertyKey]
        rangeQuery.range[propertyKey] = { ...existing, [comparison]: operatorsObject[comparison] }
      }
    })
  }
  return rangeQuery
}

// assumes a valid RFC3339 datetime or interval
// validation was previously done by api.extractDatetime
export function buildDatetimeQuery(parameters) {
  let dateQuery
  const { datetime } = parameters
  if (datetime) {
    if (datetime.includes('/')) {
      const [start, end] = datetime.split('/')
      const datetimeRange = {}
      if (start && start !== '..') datetimeRange.gte = start
      if (end && end !== '..') datetimeRange.lte = end
      dateQuery = {
        range: {
          'properties.datetime': datetimeRange
        }
      }
    } else {
      dateQuery = {
        term: {
          'properties.datetime': datetime
        }
      }
    }
  }
  return dateQuery
}

function buildQuery(parameters) {
  const eq = 'eq'
  const inop = 'in'
  const { query, intersects, collections, ids } = parameters
  let filterQueries = []
  if (query) {
    // Using reduce rather than map as we don't currently support all
    // stac query operators.
    filterQueries = Object.keys(query).reduce((accumulator, property) => {
      const operatorsObject = query[property]
      const operators = Object.keys(operatorsObject)
      if (operators.includes(eq)) {
        const termQuery = {
          term: {
            [`properties.${property}`]: operatorsObject.eq
          }
        }
        accumulator.push(termQuery)
      } else if (operators.includes(inop)) {
        const termsQuery = {
          terms: {
            [`properties.${property}`]: operatorsObject.in
          }
        }
        accumulator.push(termsQuery)
      }
      const rangeQuery = buildRangeQuery(property, operators, operatorsObject)
      if (rangeQuery) {
        accumulator.push(rangeQuery)
      }
      return accumulator
    }, filterQueries)
  }

  if (ids) {
    filterQueries.push({
      terms: {
        id: ids
      }
    })
  }

  if (collections) {
    filterQueries.push({
      terms: {
        collection: collections
      }
    })
  }

  if (intersects) {
    filterQueries.push({
      geo_shape: {
        geometry: { shape: intersects }
      }
    })
  }

  const datetimeQuery = buildDatetimeQuery(parameters)
  if (datetimeQuery instanceof Error) {
    throw datetimeQuery
  }

  if (datetimeQuery) {
    filterQueries.push(datetimeQuery)
  }

  return {
    query: {
      bool: {
        filter: filterQueries
      }
    }
  }
}

function buildIdQuery(id) {
  return {
    query: {
      bool: {
        filter: {
          term: {
            id: id
          }
        }
      }
    }
  }
}

const DEFAULT_SORTING = [
  { 'properties.datetime': { order: 'desc' } },
  { id: { order: 'desc' } },
  { collection: { order: 'desc' } }
]

function buildSort(parameters) {
  const { sortby } = parameters
  if (sortby && sortby.length) {
    return sortby.map((sortRule) => {
      const { field, direction } = sortRule
      return {
        [field]: {
          order: direction
        }
      }
    })
  }
  return DEFAULT_SORTING
}

function buildSearchAfter(parameters) {
  const { next } = parameters
  if (next) {
    return next.split(',')
  }
  return undefined
}

function buildFieldsFilter(parameters) {
  const { fields } = parameters
  let _sourceIncludes = []
  if (parameters.hasOwnProperty('fields')) {
    // if fields parameters supplied at all, start with this initial set, otherwise return all
    _sourceIncludes = [
      'id',
      'type',
      'geometry',
      'bbox',
      'links',
      'assets',
      'collection',
      'properties.datetime'
    ]
  }
  let _sourceExcludes = []
  if (fields) {
    const { include, exclude } = fields
    // Add include fields to the source include list if they're not already in it
    if (include && include.length > 0) {
      include.forEach((field) => {
        if (_sourceIncludes.indexOf(field) < 0) {
          _sourceIncludes.push(field)
        }
      })
    }
    // Remove exclude fields from the default include list and add them to the source exclude list
    if (exclude && exclude.length > 0) {
      _sourceIncludes = _sourceIncludes.filter((field) => !exclude.includes(field))
      _sourceExcludes = exclude
    }
  }
  return { _sourceIncludes, _sourceExcludes }
}

/*
 * Create a new Collection
 *
 */
async function indexCollection(collection) {
  const client = await _client()

  const exists = await client.indices.exists({ index: COLLECTIONS_INDEX })
  if (!exists.body) {
    await createIndex(COLLECTIONS_INDEX)
  }

  const collectionDocResponse = await client.index({
    index: COLLECTIONS_INDEX,
    id: collection.id,
    body: collection,
    opType: 'create'
  })

  const indexCreateResponse = await createIndex(collection.id)

  return [collectionDocResponse, indexCreateResponse]
}

/*
 * Create a new Item in an index corresponding to the Collection
 *
 */
async function indexItem(item) {
  const client = await _client()

  const exists = await client.indices.exists({ index: item.collection })
  if (!exists.body) {
    return new Error(`Index ${item.collection} does not exist, add before creating items`)
  }

  const now = new Date().toISOString()
  Object.assign(item.properties, {
    created: now,
    updated: now
  })

  const response = await client.index({
    index: item.collection,
    id: item.id,
    body: item,
    opType: 'create'
  })

  return response
}

/*
 *
 * This conforms to a PATCH request and updates an existing item by ID
 * using a partial item description, compliant with RFC 7386.
 *
 */
async function partialUpdateItem(collectionId, itemId, updateFields) {
  const client = await _client()

  // Handle inserting required default properties to `updateFields`
  const requiredProperties = {
    updated: new Date().toISOString()
  }

  if (updateFields.properties) {
    // If there are properties incoming, merge and overwrite our required ones.
    Object.assign(updateFields.properties, requiredProperties)
  } else {
    updateFields.properties = requiredProperties
  }

  const response = await client.update({
    index: collectionId,
    id: itemId,
    _source: true,
    body: {
      doc: updateFields
    }
  })

  return response
}

async function deleteItem(collectionId, itemId) {
  const client = await _client()
  if (client === undefined) throw new Error('Client is undefined')
  return await client.delete_by_query({
    index: collectionId,
    body: buildIdQuery(itemId),
    waitForCompletion: true
  })
}

async function dbQuery(parameters) {
  logger.info(`Search database query: ${JSON.stringify(parameters)}`)
  const client = await _client()
  if (client === undefined) throw new Error('Client is undefined')
  const response = await client.search(parameters)
  logger.info(`Response: ${JSON.stringify(response)}`)
  return response
}

// get single collection
async function getCollection(collectionId) {
  const response = await dbQuery({
    index: COLLECTIONS_INDEX,
    body: buildIdQuery(collectionId)
  })
  if (Array.isArray(response.body.hits.hits) && response.body.hits.hits.length) {
    return response.body.hits.hits[0]._source
  }
  return new Error('Collection not found')
}

// get all collections
async function getCollections(page = 1, limit = 100) {
  try {
    const response = await dbQuery({
      index: COLLECTIONS_INDEX,
      size: limit,
      from: (page - 1) * limit
    })
    return response.body.hits.hits.map((r) => (r._source))
  } catch (e) {
    logger.error(`Failure getting collections, maybe none exist? ${e}`)
  }
  return []
}

async function populateCollectionToIndexMapping() {
  if (process.env.COLLECTION_TO_INDEX_MAPPINGS) {
    try {
      collectionToIndexMapping = JSON.parse(process.env.COLLECTION_TO_INDEX_MAPPINGS)
    } catch (e) {
      logger.error('COLLECTION_TO_INDEX_MAPPINGS is not a valid JSON object.')
      collectionToIndexMapping = {}
    }
  } else {
    collectionToIndexMapping = {}
  }
}

async function indexForCollection(collectionId) {
  return collectionToIndexMapping[collectionId] || collectionId
}

async function populateUnrestrictedIndices() {
  if (!unrestrictedIndices) {
    if (process.env.COLLECTION_TO_INDEX_MAPPINGS) {
      if (!collectionToIndexMapping) {
        await populateCollectionToIndexMapping()
      }
      // When no collections are specified, the default index restriction
      // is for all local indices (*, which excludes remote indices), excludes any
      // system indices that start with a ".", the collections index, and then
      // explicitly adds each of the remote indicies that have a mapping defined to them
      unrestrictedIndices = DEFAULT_INDICES.concat(
        Object.values(collectionToIndexMapping)
      )
    } else {
      unrestrictedIndices = DEFAULT_INDICES
    }
  }
}

export async function constructSearchParams(parameters, page, limit) {
  const { id, collections } = parameters

  let body
  if (id) {
    body = buildIdQuery(id)
  } else {
    body = buildQuery(parameters)
    body.sort = buildSort(parameters) // sort applied to the id query causes hang???
    body.search_after = buildSearchAfter(parameters)
  }

  let indices
  if (Array.isArray(collections) && collections.length) {
    if (process.env.COLLECTION_TO_INDEX_MAPPINGS) {
      if (!collectionToIndexMapping) await populateCollectionToIndexMapping()
      indices = await Promise.all(collections.map(async (x) => await indexForCollection(x)))
    } else {
      indices = collections
    }
  } else {
    if (!unrestrictedIndices) {
      populateUnrestrictedIndices()
    }
    indices = unrestrictedIndices
  }

  const searchParams = {
    index: indices,
    body,
    size: limit,
    track_total_hits: true
  }

  if (page !== undefined) {
    searchParams.from = (page - 1) * limit
  }

  // disable fields filter for now
  const { _sourceIncludes, _sourceExcludes } = buildFieldsFilter(parameters)
  if (_sourceExcludes.length) {
    searchParams._sourceExcludes = _sourceExcludes
  }
  if (_sourceIncludes.length) {
    searchParams._sourceIncludes = _sourceIncludes
  }

  return searchParams
}

async function search(parameters, page, limit = 10) {
  const searchParams = await constructSearchParams(parameters, page, limit)
  const dbResponse = await dbQuery({
    ignore_unavailable: true,
    allow_no_indices: true,
    ...searchParams
  })

  const results = dbResponse.body.hits.hits.map((r) => (r._source))
  const response = {
    results,
    context: {
      limit: Number(limit),
      matched: dbResponse.body.hits.total.value,
      returned: results.length
    }
  }
  return response
}

async function aggregate(parameters) {
  const searchParams = await constructSearchParams(parameters)
  searchParams.body.size = 0
  searchParams.body.aggs = {
    total_count: { value_count: { field: 'id' } },
    collection_frequency: { terms: { field: 'collection', size: 100 } },
    platform_frequency: { terms: { field: 'properties.platform', size: 100 } },
    cloud_cover_frequency: {
      range: {
        field: 'properties.eo:cloud_cover',
        ranges: [
          { to: 5 },
          { from: 5, to: 15 },
          { from: 15, to: 40 },
          { from: 40 },
        ],
      }
    },
    datetime_frequency: {
      date_histogram: {
        field: 'properties.datetime',
        calendar_interval: 'month',
      }
    },
    datetime_min: { min: { field: 'properties.datetime' } },
    datetime_max: { max: { field: 'properties.datetime' } },
    grid_code_frequency: {
      terms: {
        field: 'properties.grid:code',
        size: 1000,
        missing: 'none',
      }
    },
    grid_code_landsat_frequency: {
      terms: {
        field: 'properties.landsat:wrs_type',
        size: 1000,
        missing: 'none',
        script: {
          lang: 'painless',
          source: "return 'WRS' + _value + '-' + "
            + "doc['properties.landsat:wrs_path'].value + "
            + "doc['properties.landsat:wrs_row'].value"
        }
      }
    },
    sun_elevation_frequency: {
      histogram: {
        field: 'properties.view:sun_elevation',
        interval: 5
      }
    },
    sun_azimuth_frequency: {
      histogram: {
        field: 'properties.view:sun_azimuth',
        interval: 5
      }
    },
    off_nadir_frequency: {
      histogram: {
        field: 'properties.view:off_nadir',
        interval: 5
      }
    }
  }

  const dbResponse = await dbQuery({
    ignore_unavailable: true,
    allow_no_indices: true,
    ...searchParams
  })

  return dbResponse
}

const getItem = async (collectionId, itemId) => {
  const searchResponse = await search({
    collections: [collectionId],
    id: itemId
  })

  return searchResponse.results[0]
}

export const getItemCreated = async (collectionId, itemId) => {
  const item = await getItem(collectionId, itemId)
  if (!item) return undefined
  if (!item.properties) return undefined
  return item.properties.created
}

/*
 *  Update an existing Item in an index corresponding to the Collection
 *
 */
async function updateItem(item) {
  const client = await _client()

  const exists = await client.indices.exists({ index: item.collection })
  if (!exists.body) {
    return new Error(`Index ${item.collection} does not exist, add before creating items`)
  }

  const now = new Date().toISOString()
  const created = (await getItemCreated(item.collection, item.id)) || now

  Object.assign(item.properties, {
    created: created,
    updated: now
  })

  const response = await client.index({
    index: item.collection,
    id: item.id,
    body: item,
    opType: 'index'
  })

  return response
}

async function healthCheck() {
  const client = await _client.client()
  if (client === undefined) throw new Error('Client is undefined')
  const health = await client.cat.health()
  logger.debug(`Health: ${JSON.stringify(health)}`)
  return health
}

export default {
  getCollections,
  getCollection,
  indexCollection,
  getItem,
  getItemCreated,
  indexItem,
  updateItem,
  deleteItem,
  partialUpdateItem,
  isIndexNotFoundError,
  search,
  aggregate,
  constructSearchParams,
  buildDatetimeQuery,
  healthCheck
}
