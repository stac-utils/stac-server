const esClient = require('./esClient')
const logger = console //require('./logger')

const COLLECTIONS_INDEX = process.env.COLLECTIONS_INDEX || 'collections'

const isIndexNotFoundError = (e) => (
  e instanceof Error
    && e.name === 'ResponseError'
    && e.message.includes('index_not_found_exception'))

/*
This module is used for connecting to an Elasticsearch instance, writing records,
searching records, and managing the indexes. It looks for the ES_HOST environment
variable which is the URL to the elasticsearch host
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
        const exisiting = rangeQuery.range[propertyKey]
        rangeQuery.range[propertyKey] = { ...exisiting, [comparison]: operatorsObject[comparison] }
      }
    })
  }
  return rangeQuery
}

// assumes a valid RFC3339 datetime or interval
// validation was previously done by api.extractDatetime
function buildDatetimeQuery(parameters) {
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
  let must = []
  if (query) {
    // Using reduce rather than map as we don't currently support all
    // stac query operators.
    must = Object.keys(query).reduce((accumulator, property) => {
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
    }, must)
  }

  if (ids) {
    must.push({
      terms: {
        id: ids
      }
    })
  }

  if (collections) {
    must.push({
      terms: {
        collection: collections
      }
    })
  }

  if (intersects) {
    must.push({
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
    must.push(datetimeQuery)
  }

  const filter = { bool: { must } }
  const queryBody = {
    constant_score: { filter }
  }
  return { query: queryBody }
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
 * Create a new Item in an index corresponding to the Collection
 *
 */
async function indexItem(item) {
  const client = await esClient.client()

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
  const client = await esClient.client()

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
  const client = await esClient.client()
  if (client === undefined) throw new Error('Client is undefined')
  return await client.delete_by_query({
    index: collectionId,
    body: buildIdQuery(itemId),
    waitForCompletion: true
  })
}

async function esQuery(parameters) {
  logger.info(`Elasticsearch query: ${JSON.stringify(parameters)}`)
  const client = await esClient.client()
  if (client === undefined) throw new Error('Client is undefined')
  const response = await client.search(parameters)
  logger.info(`Response: ${JSON.stringify(response)}`)
  return response
}

// get single collection
async function getCollection(collectionId) {
  const response = await esQuery({
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
  const response = await esQuery({
    index: COLLECTIONS_INDEX,
    size: limit,
    from: (page - 1) * limit
  })
  const results = response.body.hits.hits.map((r) => (r._source))
  return results
}

async function constructSearchParams(parameters, limit) {
  const { id, collections } = parameters

  let body
  if (id) {
    body = buildIdQuery(id)
  } else {
    body = buildQuery(parameters)
    body.sort = buildSort(parameters)
    body.search_after = buildSearchAfter(parameters)
  }

  // Specifying the scroll parameter makes the total work
  const searchParams = {
    index: collections || '*,-*kibana*,-collections',
    body,
    size: limit,
    track_total_hits: true
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

async function search(parameters, limit = 10) {
  const searchParams = await constructSearchParams(parameters, limit)
  const esResponse = await esQuery({
    ignore_unavailable: true,
    allow_no_indices: true,
    ...searchParams
  })

  const results = esResponse.body.hits.hits.map((r) => (r._source))
  const response = {
    results,
    context: {
      limit: Number(limit),
      matched: esResponse.body.hits.total.value,
      returned: results.length
    }
  }
  return response
}

const getItem = async (collectionId, itemId) => {
  const searchResponse = await search({
    collections: [collectionId],
    id: itemId
  })

  return searchResponse.results[0]
}

const getItemCreated = async (collectionId, itemId) => {
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
  const client = await esClient.client()

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

module.exports = {
  getCollection,
  getCollections,
  getItem,
  getItemCreated,
  indexItem,
  updateItem,
  deleteItem,
  partialUpdateItem,
  isIndexNotFoundError,
  search,
  constructSearchParams,
  buildDatetimeQuery
}
