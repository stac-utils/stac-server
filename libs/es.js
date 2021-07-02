'use strict'

const esClient = require('./esClient.js')
const logger = console //require('./logger')

const COLLECTIONS_INDEX = process.env.COLLECTIONS_INDEX || 'collections'
const ITEMS_INDEX = process.env.ITEMS_INDEX || 'items'

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
  if (operators.includes(gt) || operators.includes(lt) ||
         operators.includes(gte) || operators.includes(lte)) {
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
        rangeQuery.range[propertyKey] = Object.assign({}, exisiting, {
          [comparison]: operatorsObject[comparison]
        })
      }
    })
  }
  return rangeQuery
}

function buildDatetimeQuery(parameters) {
  let dateQuery
  const { datetime } = parameters
  if (datetime) {
    const dataRange = datetime.split('/')
    if (dataRange.length === 2) {
      dateQuery = {
        range: {
          'properties.datetime': {
            gte: dataRange[0],
            lte: dataRange[1]
          }
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
  const { query, intersects, collections } = parameters
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
      const rangeQuery =
        buildRangeQuery(property, operators, operatorsObject)
      if (rangeQuery) {
        accumulator.push(rangeQuery)
      }
      return accumulator
    }, must)
  }

  if (collections) {
    must.push({
      terms: {
        'collection': collections
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
  // TODO: Figure out why term: {id} does not work but {_id} does
  return {
    query: {
      constant_score: {
        filter: {
          term: {
            _id: id
          }
        }
      }
    }
  }
}

function buildIdsQuery(ids) {
  return {
    query: {
      ids: {
        values: ids
      }
    }
  }
}


function buildSort(parameters) {
  const { sortby } = parameters
  let sorting
  if (sortby && sortby.length > 0) {
    sorting = sortby.map((sortRule) => {
      const { field, direction } = sortRule
      return {
        [field]: {
          order: direction
        }
      }
    })
  } else {
    // Default item sorting
    sorting = [
      { 'properties.datetime': { order: 'desc' } }
    ]
  }
  return sorting
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
 * Part of the Transaction extension https://github.com/radiantearth/stac-api-spec/tree/master/extensions/transaction
 *
 * This conforms to a PATCH request and updates an existing item by ID
 * using a partial item description, compliant with RFC 7386.
 *
 * PUT should be implemented separately and is TODO.
 */
async function editPartialItem(itemId, updateFields) {
  const client = await esClient.client()

  // Handle inserting required default properties to `updateFields`
  const requiredProperties = {
    updated: new Date().toISOString()
  }

  if (updateFields.properties) {
    // If there are properties incoming, merge and overwrite
    // our required ones.
    Object.assign(updateFields.properties, requiredProperties)
  } else {
    updateFields.properties = requiredProperties
  }

  const response = await client.update({
    index: ITEMS_INDEX,
    id: itemId,
    type: 'doc',
    _source: true,
    body: {
      doc: updateFields
    }
  })
  return response
}


async function esQuery(parameters) {
  logger.info(`Elasticsearch query: ${JSON.stringify(parameters)}`)
  const client = await esClient.client()
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
  // TODO: handle zero hits, _source is undefined
  const result = response.body.hits.hits[0]._source
  return result
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


async function search(parameters, page = 1, limit = 10) {
  let body
  if (parameters.ids) {
    const { ids } = parameters
    body = buildIdsQuery(ids)
  } else if (parameters.id) {
    const { id } = parameters
    body = buildIdQuery(id)
  } else {
    body = buildQuery(parameters)
  }
  const sort = buildSort(parameters)
  body.sort = sort

  let index
  // determine the right indices
  if (parameters.hasOwnProperty('collections')) {
    index = parameters.collections
  } else {
    index = '*,-*kibana*,-collections'
  }

  // Specifying the scroll parameter makes the total work
  const searchParams = {
    index,
    body,
    size: limit,
    from: (page - 1) * limit,
    track_total_hits: true
  }

  // disable fields filter for now
  const { _sourceIncludes, _sourceExcludes } = buildFieldsFilter(parameters)
  if (_sourceExcludes.length > 0) {
    searchParams._sourceExcludes = _sourceExcludes
  }
  if (_sourceIncludes.length > 0) {
    searchParams._sourceIncludes = _sourceIncludes
  }

  const esResponse = await esQuery(searchParams)

  const results = esResponse.body.hits.hits.map((r) => (r._source))
  const response = {
    results,
    context: {
      page: Number(page),
      limit: Number(limit),
      matched: esResponse.body.hits.total.value,
      returned: results.length
    },
    links: []
  }
  const nextlink = (((page * limit) < esResponse.body.hits.total.value) ? page + 1 : null)
  if (nextlink) {
    response.links.push({
      title: 'next',
      type: 'application/json',
      href: nextlink
      // TODO - add link to next page
    })
  }
  return response
}

module.exports = {
  getCollection,
  getCollections,
  search,
  editPartialItem
}
