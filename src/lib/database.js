import { isEmpty } from 'lodash-es'
import { dbClient as _client, createIndex } from './database-client.js'
import logger from './logger.js'

const COLLECTIONS_INDEX = process.env['COLLECTIONS_INDEX'] || 'collections'
const DEFAULT_INDICES = ['*', '-.*', '-collections']
const LOGICAL_OP = {
  AND: 'and',
  OR: 'or',
  NOT: 'not'
}
const COMPARISON_OP = {
  EQ: '=',
  NEQ: '<>',
  LT: '<',
  LTE: '<=',
  GT: '>',
  GTE: '>=',
  IS_NULL: 'isNull'
}
const RANGE_TRANSLATION = {
  '<': 'lt',
  '<=': 'lte',
  '>': 'gt',
  '>=': 'gte'
}
const UNPREFIXED_FIELDS = [
  'id',
  'collection',
  'geometry',
  'bbox'
]

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

function buildQueryExtQuery(query) {
  const eq = 'eq'
  const inop = 'in'
  const startsWith = 'startsWith'
  const endsWith = 'endsWith'
  const contains = 'contains'
  let filterQueries = []

  // Using reduce rather than map as we don't currently support all
  // stac query operators.
  filterQueries = Object.keys(query).reduce((accumulator, property) => {
    const operatorsObject = query[property]
    const operators = Object.keys(operatorsObject)

    // eq
    if (operators.includes(eq)) {
      accumulator.push({
        term: {
          [`properties.${property}`]: operatorsObject.eq
        }
      })
    }

    // in
    if (operators.includes(inop)) {
      accumulator.push({
        terms: {
          [`properties.${property}`]: operatorsObject.in
        }
      })
    }

    // startsWith
    if (operators.includes(startsWith)) {
      accumulator.push({
        prefix: {
          [`properties.${property}`]: {
            value: operatorsObject.startsWith
          }
        }
      })
    }

    // endsWith
    if (operators.includes(endsWith)) {
      accumulator.push({
        wildcard: {
          [`properties.${property}`]: {
            value: `*${operatorsObject.endsWith}`
          }
        }
      })
    }

    // contains
    if (operators.includes(contains)) {
      accumulator.push({
        wildcard: {
          [`properties.${property}`]: {
            value: `*${operatorsObject.contains}*`
          }
        }
      })
    }

    // lt, lte, gt, gte
    const rangeQuery = buildRangeQuery(property, operators, operatorsObject)
    if (rangeQuery) {
      accumulator.push(rangeQuery)
    }

    return accumulator
  }, filterQueries)

  const neq = 'neq'
  let mustNotQueries = []

  mustNotQueries = Object.keys(query).reduce((accumulator, property) => {
    const operatorsObject = query[property]
    const operators = Object.keys(operatorsObject)

    // neq
    if (operators.includes(neq)) {
      accumulator.push({
        term: {
          [`properties.${property}`]: operatorsObject.neq
        }
      })
    }

    return accumulator
  }, mustNotQueries)

  return {
    bool: {
      filter: filterQueries,
      must_not: mustNotQueries
    }
  }
}

function buildFilterExtQuery(filter) {
  let cql2Field = filter.args[0].property
  if (!UNPREFIXED_FIELDS.includes(cql2Field)) {
    cql2Field = `properties.${cql2Field}`
  }

  let cql2Value = filter.args[1]
  if (typeof cql2Value === 'object' && cql2Value.timestamp) {
    cql2Value = cql2Value.timestamp
  }

  switch (filter.op) {
  // recursive cases
  case LOGICAL_OP.AND:
    return {
      bool: {
        filter: filter.args.map(buildFilterExtQuery)
      }
    }
  case LOGICAL_OP.OR:
    return {
      bool: {
        should: filter.args.map(buildFilterExtQuery),
        minimum_should_match: 1
      }
    }
  case LOGICAL_OP.NOT:
    return {
      bool: {
        must_not: filter.args.map(buildFilterExtQuery)
      }
    }

  // direct cases
  case COMPARISON_OP.EQ:
    return {
      term: {
        [cql2Field]: cql2Value
      }
    }
  case COMPARISON_OP.NEQ:
    return {
      bool: {
        must_not: [
          {
            term: {
              [cql2Field]: cql2Value
            }
          }
        ]
      }
    }
  case COMPARISON_OP.IS_NULL:
    return {
      bool: {
        must_not: [
          {
            exists: {
              field: cql2Field
            }
          }
        ]
      }
    }

  // range cases
  case COMPARISON_OP.LT:
  case COMPARISON_OP.LTE:
  case COMPARISON_OP.GT:
  case COMPARISON_OP.GTE:
    return {
      range: {
        [cql2Field]: {
          [RANGE_TRANSLATION[filter.op]]: cql2Value
        }
      }
    }

  // should not get here
  default:
    throw new Error(`Unknown filter operation: ${filter.op}`)
  }
}

function buildItemSearchQuery(parameters) {
  const { intersects, collections, ids } = parameters
  const filterQueries = []

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
  } else if (datetimeQuery) {
    filterQueries.push(datetimeQuery)
  }

  return {
    bool: {
      filter: filterQueries,
    }
  }
}

function buildOpenSearchQuery(parameters) {
  const { query, filter, intersects, collections, ids } = parameters

  let cql2Query = {}
  let stacqlQuery = {}
  let itemSearchQuery = {}
  const osQuery = { bool: {} }

  if (query) {
    stacqlQuery = buildQueryExtQuery(query)
  }

  if (filter) {
    cql2Query = buildFilterExtQuery(filter)
    // non-recursive results can be bare
    if (!cql2Query.bool) {
      cql2Query = { bool: { filter: [cql2Query] } }
    }
  }

  if (intersects || collections || ids) {
    itemSearchQuery = buildItemSearchQuery(parameters)
  }

  const combinedFilter = [
    ...(cql2Query.bool?.filter || []),
    ...(stacqlQuery.bool?.filter || []),
    ...(itemSearchQuery.bool?.filter || [])
  ]
  const combinedShould = [
    ...(cql2Query.bool?.should || []),
  ]
  const combinedMustNot = [
    ...(cql2Query.bool?.must_not || []),
    ...(stacqlQuery.bool?.must_not || []),
  ]

  if (!isEmpty(combinedFilter)) {
    osQuery.bool.filter = combinedFilter
  }
  if (!isEmpty(combinedShould)) {
    osQuery.bool.should = combinedShould
    osQuery.bool.minimum_should_match = 1
  }
  if (!isEmpty(combinedMustNot)) {
    osQuery.bool.must_not = combinedMustNot
  }

  if (isEmpty(osQuery.bool)) {
    return { query: { match_all: {} } }
  }

  return { query: osQuery }
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
      'stac_version',
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
  logger.debug('Search query: %j', parameters)
  const client = await _client()
  if (client === undefined) throw new Error('Client is undefined')
  const response = await client.search(parameters)
  logger.debug('Response: %j', response)
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
    logger.error('Failure getting collections, maybe none exist?', e)
    return new Error('Collections not found. This is likely '
    + 'because the server has not been initialized with create_indices, '
    + 'cannot connect to the database, or cannot authenticate to the database.')
  }
}

async function populateCollectionToIndexMapping() {
  if (process.env['COLLECTION_TO_INDEX_MAPPINGS']) {
    try {
      collectionToIndexMapping = JSON.parse(process.env['COLLECTION_TO_INDEX_MAPPINGS'])
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
    if (process.env['COLLECTION_TO_INDEX_MAPPINGS']) {
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
    body = buildOpenSearchQuery(parameters)
    body.sort = buildSort(parameters) // sort applied to the id query causes hang???
    body.search_after = buildSearchAfter(parameters)
  }

  let indices
  if (Array.isArray(collections) && collections.length) {
    if (process.env['COLLECTION_TO_INDEX_MAPPINGS']) {
      if (!collectionToIndexMapping) await populateCollectionToIndexMapping()
      indices = await Promise.all(collections.map(async (x) => await indexForCollection(x)))
    } else {
      indices = collections
    }
  } else {
    if (!unrestrictedIndices) {
      await populateUnrestrictedIndices()
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

const ALL_AGGREGATIONS = {
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
      missing: 'none',
      size: 10000,
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

/**
 * @param {Array} aggregations
 * @param {Object} parameters
 * @param {number} geohashPrecision
 * @param {number} geohexPrecision
 * @param {number} geotilePrecision
 * @param {any} centroidGeohashGridPrecision
 * @param {any} centroidGeohexGridPrecision
 * @param {any} centroidGeotileGridPrecision
 * @param {any} geometryGeohashGridPrecision
 * @param {any} geometryGeotileGridPrecision
 * @returns {Promise<Object>}
 */
async function aggregate(
  aggregations, parameters,
  geohashPrecision, geohexPrecision, geotilePrecision,
  centroidGeohashGridPrecision,
  centroidGeohexGridPrecision,
  centroidGeotileGridPrecision,
  geometryGeohashGridPrecision,
  // geometryGeohexGridPrecision,
  geometryGeotileGridPrecision,
) {
  const searchParams = await constructSearchParams(parameters)
  searchParams.body.size = 0

  logger.debug('Aggregations: %j', aggregations)

  // include all aggregations specified
  // this will ignore aggregations with the wrong names
  searchParams.body.aggs = Object.keys(ALL_AGGREGATIONS).reduce((o, k) => {
    if (aggregations.includes(k)) o[k] = ALL_AGGREGATIONS[k]
    return o
  }, {})

  // deprecated centroid

  if (aggregations.includes('grid_geohash_frequency')) {
    searchParams.body.aggs.grid_geohash_frequency = {
      geohash_grid: {
        field: 'properties.proj:centroid',
        precision: geohashPrecision
      }
    }
  }

  if (aggregations.includes('grid_geohex_frequency')) {
    searchParams.body.aggs.grid_geohex_frequency = {
      geohex_grid: {
        field: 'properties.proj:centroid',
        precision: geohexPrecision
      }
    }
  }

  if (aggregations.includes('grid_geotile_frequency')) {
    searchParams.body.aggs.grid_geotile_frequency = {
      geotile_grid: {
        field: 'properties.proj:centroid',
        precision: geotilePrecision
      }
    }
  }

  // centroid

  if (aggregations.includes('centroid_geohash_grid_frequency')) {
    searchParams.body.aggs.centroid_geohash_grid_frequency = {
      geohash_grid: {
        field: 'properties.proj:centroid',
        precision: centroidGeohashGridPrecision
      }
    }
  }

  if (aggregations.includes('centroid_geohex_grid_frequency')) {
    searchParams.body.aggs.centroid_geohex_grid_frequency = {
      geohex_grid: {
        field: 'properties.proj:centroid',
        precision: centroidGeohexGridPrecision
      }
    }
  }

  if (aggregations.includes('centroid_geotile_grid_frequency')) {
    searchParams.body.aggs.centroid_geotile_grid_frequency = {
      geotile_grid: {
        field: 'properties.proj:centroid',
        precision: centroidGeotileGridPrecision
      }
    }
  }

  // geometry

  if (aggregations.includes('geometry_geohash_grid_frequency')) {
    searchParams.body.aggs.geometry_geohash_grid_frequency = {
      geohash_grid: {
        field: 'geometry',
        precision: geometryGeohashGridPrecision,
      }
    }
  }

  // if (aggregations.includes('geometry_geohex_grid_frequency')) {
  //   searchParams.body.aggs.geometry_geohex_grid_frequency = {
  //     geohex_grid: {
  //       field: 'geometry',
  //       precision: geometryGeohexGridPrecision
  //     }
  //   }
  // }

  if (aggregations.includes('geometry_geotile_grid_frequency')) {
    searchParams.body.aggs.geometry_geotile_grid_frequency = {
      geotile_grid: {
        field: 'geometry',
        precision: geometryGeotileGridPrecision
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
  const client = await _client()
  if (client === undefined) throw new Error('Client is undefined')
  return client.cat.health()
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
