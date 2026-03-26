import { pickBy, assign, get as _getNested } from 'lodash-es'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { NotFoundError, ValidationError } from './errors.js'
import { isIndexNotFoundError } from './database.js'
import logger from './logger.js'
import {
  extractLimit,
  extractPrecision,
  extractAggregations,
  extractPage,
  extractDatetime,
  createQueryFields,
  extractFields,
  extractBbox,
  extractIntersects,
  extractStacQuery,
  extractCql2Filter,
  extractRestrictionCql2Filter,
  concatenateCql2Filters,
} from './api-utils.js'

// max number of collections to retrieve
const COLLECTION_LIMIT = process.env['STAC_SERVER_COLLECTION_LIMIT'] || 100

const DEFAULT_AGGREGATIONS = [
  {
    name: 'total_count',
    data_type: 'integer'
  },
  {
    name: 'datetime_max',
    data_type: 'datetime'
  },
  {
    name: 'datetime_min',
    data_type: 'datetime'
  },
  {
    name: 'datetime_frequency',
    data_type: 'frequency_distribution',
    frequency_distribution_data_type: 'datetime'
  },
]

const ALL_AGGREGATION_NAMES = DEFAULT_AGGREGATIONS.map((x) => x.name).concat(
  [
    'collection_frequency',
    'grid_code_frequency',
    'grid_geohash_frequency',
    'grid_geohex_frequency',
    'grid_geotile_frequency',
    'centroid_geohash_grid_frequency',
    'centroid_geohex_grid_frequency',
    'centroid_geotile_grid_frequency',
    'geometry_geohash_grid_frequency',
    // 'geometry_geohex_grid_frequency',
    'geometry_geotile_grid_frequency',
    'platform_frequency',
    'sun_elevation_frequency',
    'sun_azimuth_frequency',
    'off_nadir_frequency',
    'cloud_cover_frequency',
  ]
)

const extractSortby = function (params) {
  let sortbyRules
  const { sortby } = params
  if (sortby) {
    if (typeof sortby === 'string') {
      // GET request - different syntax
      const sortbys = sortby.split(',')

      sortbyRules = sortbys.map((sortbyRule) => {
        if (sortbyRule[0] === '-') {
          return { field: sortbyRule.slice(1), direction: 'desc' }
        }
        if (sortbyRule[0] === '+') {
          return { field: sortbyRule.slice(1), direction: 'asc' }
        }
        return { field: sortbyRule, direction: 'asc' }
      })
    } else {
      // POST request
      sortbyRules = sortby.slice()
    }
  }
  return sortbyRules
}

/**
 * Parse a string or array of IDs into an array of strings or undefined.
 * @param {string | string[] | undefined} ids - The IDs parameter to parse
 * @returns {string[] | undefined} Parsed array of ID strings or undefined
 */
const parseIds = function (ids) {
  let idsRules
  if (ids) {
    if (typeof ids === 'string') {
      try {
        idsRules = JSON.parse(ids)
      } catch (_) {
        idsRules = ids.split(',')
      }
    } else {
      idsRules = ids.slice()
    }
  }
  return idsRules
}

const extractIds = function (params) {
  return parseIds(params.ids)
}

const extractAllowedCollectionIds = function (params, headers) {
  if (process.env['ENABLE_COLLECTIONS_AUTHX'] !== 'true') {
    return undefined
  }

  const authxHeader = headers['stac-collections-authx']

  if (authxHeader) {
    return parseIds(authxHeader)
  }

  if (params._collections) {
    return parseIds(params._collections)
  }

  return []
}

const extractCollectionIds = function (params) {
  return parseIds(params.collections)
}

const filterAllowedCollectionIds = function (allowedCollectionIds, specifiedCollectionIds) {
  return (
    Array.isArray(allowedCollectionIds) && !allowedCollectionIds.includes('*')
  ) ? allowedCollectionIds.filter(
      (x) => !specifiedCollectionIds || specifiedCollectionIds.includes(x)
    ) : specifiedCollectionIds
}

const isCollectionIdAllowed = function (allowedCollectionIds, collectionId) {
  return !Array.isArray(allowedCollectionIds)
          || allowedCollectionIds.includes(collectionId)
          || allowedCollectionIds.includes('*')
}

export const parsePath = function (inpath) {
  const searchFilters = {
    root: false,
    api: false,
    conformance: false,
    collections: false,
    search: false,
    collectionId: false,
    items: false,
    itemId: false,
    edit: false
  }
  const api = 'api'
  const conformance = 'conformance'
  const collections = 'collections'
  const search = 'search'
  const items = 'items'
  const edit = 'edit'

  const pathComponents = inpath.split('/').filter((x) => x)
  const { length } = pathComponents
  searchFilters.root = length === 0
  searchFilters.api = pathComponents[0] === api
  searchFilters.conformance = pathComponents[0] === conformance
  searchFilters.collections = pathComponents[0] === collections

  searchFilters.collectionId = pathComponents[0] === collections && length >= 2
    ? pathComponents[1] : false
  searchFilters.search = pathComponents[0] === search
  searchFilters.items = pathComponents[2] === items
  searchFilters.itemId = pathComponents[2] === items && length >= 4 ? pathComponents[3] : false
  searchFilters.edit = pathComponents[4] === edit
  return searchFilters
}

// Impure - mutates results
export const addCollectionLinks = function (results, endpoint) {
  results.forEach((result) => {
    const { id } = result
    let { links } = result
    if (links == null) {
      links = []
      result.links = links
    }

    // self link
    links.splice(0, 0, {
      rel: 'self',
      type: 'application/json',
      href: `${endpoint}/collections/${id}`,
      title: id
    })
    // parent catalog
    links.push({
      rel: 'parent',
      type: 'application/json',
      href: `${endpoint}`,
      title: 'Catalog'
    })
    // root catalog
    links.push({
      rel: 'root',
      type: 'application/json',
      href: `${endpoint}`,
      title: 'Catalog'
    })
    // child items
    links.push({
      rel: 'items',
      type: 'application/geo+json',
      href: `${endpoint}/collections/${id}/items`,
      title: 'Items'
    })
    // queryables
    links.push({
      rel: 'http://www.opengis.net/def/rel/ogc/1.0/queryables',
      type: 'application/schema+json',
      href: `${endpoint}/collections/${id}/queryables`,
      title: 'Queryables'
    })
    links.push({
      rel: 'aggregate',
      type: 'application/json',
      href: `${endpoint}/collections/${id}/aggregate`,
      method: 'GET',
      title: 'STAC aggregation [GET]'
    })
    links.push({
      rel: 'aggregations',
      type: 'application/json',
      href: `${endpoint}/collections/${id}/aggregations`,
      title: 'Aggregations'
    })
  })
  return results
}

// Impure - mutates results
export const addItemLinks = function (results, endpoint) {
  results.forEach((result) => {
    let { links } = result
    const { id, collection } = result
    links = (links === undefined) ? [] : links
    // self link
    links.splice(0, 0, {
      rel: 'self',
      type: 'application/geo+json',
      href: `${endpoint}/collections/${collection}/items/${id}`
    })
    // parent catalogs
    links.push({
      rel: 'parent',
      type: 'application/json',
      href: `${endpoint}/collections/${collection}`
    })
    links.push({
      rel: 'collection',
      type: 'application/json',
      href: `${endpoint}/collections/${collection}`
    })
    // root catalog
    links.push({
      rel: 'root',
      type: 'application/json',
      href: `${endpoint}`
    })
    if (process.env['ENABLE_THUMBNAILS'] === 'true') {
      links.push({
        rel: 'thumbnail',
        href: `${endpoint}/collections/${collection}/items/${id}/thumbnail`
      })
    }
    result.type = 'Feature'
    return result
  })
  return results
}

/**
 * If 'id' or 'collection' were in the 'excluded' fields, they must
 * be removed.  They were necessary for STAC Item link generation and
 * can now be removed after link generation if a user wanted to exclude them
 * Impure, we are potentially mutating 'results'
 * @param {Object} results
 * @param {Object} fields - {'exclude': [string], 'include': [string]}
 * @returns {Object}
 */
export const removeSpecialExcludeFields = function (results, fields) {
  const { exclude } = fields
  if (!exclude) return results

  const removeId = exclude.includes('id')
  const removeCollection = exclude.includes('collection')

  // exit early and avoid forEach loop if possible
  if (!removeId && !removeCollection) return results

  results.forEach((item) => {
    if (removeId) delete item.id
    if (removeCollection) delete item.collection
  })
  return results
}

const wrapResponseInFeatureCollection = function (features, links,
  numberMatched, numberReturned, limit) {
  const fc = {
    type: 'FeatureCollection',
    numberMatched,
    numberReturned,
    features,
    links
  }

  if (process.env['ENABLE_CONTEXT_EXTENSION']) {
    fc['context'] = {
      matched: numberMatched,
      returned: numberReturned,
      limit
    }
  }

  return fc
}

const buildPaginationLinks = function (
  limit, parameters, bbox, intersects, collections, filter,
  endpoint, httpMethod, _sortby, items, lastItemSort
) {
  if (items.length) {
    const dictToURI = (dict) => (
      Object.keys(dict).map(
        (p) => {
          let value = dict[p]
          if (typeof value === 'object' && value !== null) {
            if (p === 'sortby') {
              const sortFields = []
              for (let i = 0; i < value.length; i += 1) {
                if (value[i]['direction'] === 'asc') {
                  sortFields.push(value[i]['field'])
                } else {
                  sortFields.push('-'.concat(value[i]['field']))
                }
              }
              value = sortFields.join(',')
            } else if (p === 'collections') { // TODO
              value = value.toString()
            } else {
              value = JSON.stringify(value)
            }
          }
          const query = encodeURIComponent(value)
          return `${encodeURIComponent(p)}=${query}`
        }
      ).join('&')
    )

    if (lastItemSort) {
      const link = {
        rel: 'next',
        title: 'Next page of Items',
        method: httpMethod,
        type: 'application/geo+json'
      }
      const nextParams = pickBy(
        assign(parameters, { bbox, intersects, limit, next: lastItemSort, collections, filter })
      )
      if (httpMethod === 'GET') {
        const nextQueryParameters = dictToURI(nextParams)
        link.href = `${endpoint}?${nextQueryParameters}`
      } else if (httpMethod === 'POST') {
        link.href = endpoint
        link.merge = false
        link.body = nextParams
      }
      return [link]
    }
  }
  return []
}

const searchItems = async function (
  backend, httpMethod, collectionId, endpoint, parameters, headers
) {
  logger.debug('Search parameters (unprocessed): %j', parameters)

  const {
    next,
    bbox,
    intersects
  } = parameters
  if (bbox && intersects) {
    throw new ValidationError('Expected bbox OR intersects, not both')
  }
  const datetime = extractDatetime(parameters)
  const bboxGeometry = extractBbox(parameters, httpMethod)
  const intersectsGeometry = extractIntersects(parameters)
  const geometry = intersectsGeometry || bboxGeometry

  const sortby = extractSortby(parameters)
  const query = extractStacQuery(parameters)
  const specifiedFilter = extractCql2Filter(parameters)

  const combinedFilter = concatenateCql2Filters(
    specifiedFilter,
    extractRestrictionCql2Filter(parameters, headers)
  )
  const fields = extractFields(parameters)
  const queryFields = createQueryFields(fields)
  const ids = extractIds(parameters)
  const allowedCollectionIds = extractAllowedCollectionIds(
    parameters,
    headers
  )
  const specifiedCollectionIds = extractCollectionIds(parameters)
  const collections = filterAllowedCollectionIds(allowedCollectionIds, specifiedCollectionIds)
  const limit = extractLimit(parameters) || 10
  const page = extractPage(parameters)

  const searchParams = pickBy({
    datetime,
    intersects: geometry,
    query,
    filter: combinedFilter,
    sortby,
    fields: queryFields,
    ids,
    collections,
    next
  })

  let newEndpoint = `${endpoint}/search`
  let collectionEndpoint
  if (collectionId) {
    searchParams.collections = [collectionId]
    newEndpoint = `${endpoint}/collections/${collectionId}/items`
    collectionEndpoint = `${endpoint}/collections/${collectionId}`
  }

  logger.info('Search parameters (processed): %j', searchParams)

  let esResponse
  try {
    esResponse = await backend.search(searchParams, limit, page)
  } catch (error) {
    if (isIndexNotFoundError(error)) {
      esResponse = {
        results: [],
        numberMatched: 0,
        numberReturned: 0,
      }

    } else if (error?.meta?.statusCode === 400) {

      const e = error?.meta?.body?.error

      // only serialize part of the error message,
      // as error.meta.meta.connection will leak the OpenSearch URL
      let errorMessage
      if ('caused_by' in e) {
        errorMessage = JSON.stringify(e?.caused_by?.reason)
      } else if ('root_cause' in e) {
        const reason = e?.root_cause[0]?.reason
        errorMessage = reason
        if (reason.includes('No mapping found for')
            && reason.includes('to sort on')) {
          errorMessage += '. (Hint: `sortby` requires fully '
                + 'qualified identifiers, e.g. `properties.datetime` '
                + 'instead of `datetime`)'
        }
      } else if (JSON.stringify(e).includes('failed to create query')) {
        errorMessage = `Query failed with invalid parameters: ${JSON.stringify(e)}`
      } else {
        errorMessage = `Unknown error: ${JSON.stringify(e)}`
      }
      throw new ValidationError(errorMessage)
    } else {
      throw error
    }
  }

  const { results: responseItems, numberMatched, numberReturned, lastItemSort } = esResponse
  const paginationLinks = buildPaginationLinks(
    limit,
    searchParams,
    bbox,
    intersects,
    specifiedCollectionIds,
    specifiedFilter,
    newEndpoint,
    httpMethod,
    sortby,
    responseItems,
    lastItemSort
  )


  const links = paginationLinks.concat([{
    rel: 'root',
    type: 'application/json',
    href: endpoint
  }])

  if (collectionId) { // add these links for a features request

    links.push({
      rel: 'self',
      type: 'application/geo+json',
      href: newEndpoint
    })

    links.push({
      rel: 'collection',
      type: 'application/json',
      href: collectionEndpoint
    })
  }

  addItemLinks(responseItems, endpoint)
  removeSpecialExcludeFields(responseItems, fields)

  return wrapResponseInFeatureCollection(responseItems, links, numberMatched, numberReturned, limit)
}

const agg = function (esAggs, name, dataType) {
  const buckets = []
  for (const bucket of (esAggs[name]?.buckets || [])) {
    buckets.push({
      key: bucket?.key_as_string || bucket?.key,
      data_type: dataType,
      frequency: bucket?.doc_count,
      to: bucket?.to,
      from: bucket?.from,
    })
  }
  return {
    name: name,
    data_type: 'frequency_distribution',
    overflow: esAggs[name]?.sum_other_doc_count || 0,
    buckets: buckets
  }
}

const aggregate = async function (
  backend, httpMethod, collectionId, endpoint, parameters, headers
) {
  logger.debug('Aggregate parameters (unprocessed): %j', parameters)

  const {
    bbox,
    intersects
  } = parameters
  if (bbox && intersects) {
    throw new ValidationError('Expected bbox OR intersects, not both')
  }
  const datetime = extractDatetime(parameters)
  const bboxGeometry = extractBbox(parameters, httpMethod)
  const intersectsGeometry = extractIntersects(parameters)
  const geometry = intersectsGeometry || bboxGeometry
  const query = extractStacQuery(parameters)
  const filter = concatenateCql2Filters(
    extractCql2Filter(parameters),
    extractRestrictionCql2Filter(parameters, headers)
  )
  const ids = extractIds(parameters)
  const allowedCollectionIds = extractAllowedCollectionIds(parameters, headers)
  const specifiedCollectionIds = extractCollectionIds(parameters)
  const collections = filterAllowedCollectionIds(allowedCollectionIds, specifiedCollectionIds)

  if (Array.isArray(collections) && !collections.length) {
    if (collectionId) {
      return new NotFoundError()
    }

    return {
      aggregations: [],
      links: [
        {
          rel: 'self',
          type: 'application/json',
          href: `${endpoint}/aggregate`
        },
        {
          rel: 'root',
          type: 'application/json',
          href: `${endpoint}`
        }]
    }
  }

  const searchParams = pickBy({
    datetime,
    intersects: geometry,
    query,
    filter: filter,
    ids,
    collections,
  })

  let linkEndpoint = endpoint
  let collectionEndpoint
  let collection

  if (collectionId) {

    searchParams.collections = [collectionId]
    linkEndpoint = `${endpoint}/collections/${collectionId}`
    collectionEndpoint = `${endpoint}/collections/${collectionId}`
    collection = await backend.getCollection(collectionId)

    if (collection instanceof Error) {
      return collection
    }
  }

  logger.info('Aggregate parameters (processed): %j', searchParams)

  const aggregationsRequested = extractAggregations(parameters)

  // validate that aggregations are supported by collection
  // if aggregations are not defined for a collection, any aggregation may be requested
  if (collection?.aggregations) {
    const supportedAggregations = collection.aggregations.map((x) => x.name)
    for (const x of aggregationsRequested) {
      if (!supportedAggregations.includes(x)) {
        throw new ValidationError(`Aggregation ${x} not supported by collection ${collectionId}`)
      }
    }
  } else {
    for (const x of aggregationsRequested) {
      if (!ALL_AGGREGATION_NAMES.includes(x)) {
        throw new ValidationError(`Aggregation ${x} not supported at catalog level`)
      }
    }
  }

  const maxGeohashPrecision = 12
  const maxGeohexPrecision = 15
  const maxGeotilePrecision = 29

  // the "grid_*" aggregation names are now deprecated
  const geohashPrecision = extractPrecision(
    parameters,
    'grid_geohash_frequency_precision',
    1,
    maxGeohashPrecision
  )
  const geohexPrecision = extractPrecision(
    parameters,
    'grid_geohex_frequency_precision',
    0,
    maxGeohexPrecision
  )
  const geotilePrecision = extractPrecision(
    parameters,
    'grid_geotile_frequency_precision',
    0,
    maxGeotilePrecision
  )

  const centroidGeohashGridPrecision = extractPrecision(
    parameters,
    'centroid_geohash_grid_frequency_precision',
    1,
    maxGeohashPrecision
  )
  const centroidGeohexGridPrecision = extractPrecision(
    parameters,
    'centroid_geohex_grid_frequency_precision',
    0,
    maxGeohexPrecision
  )
  const centroidGeotileGridPrecision = extractPrecision(
    parameters,
    'centroid_geotile_grid_frequency_precision',
    0,
    maxGeotilePrecision
  )

  const geometryGeohashGridPrecision = extractPrecision(
    parameters,
    'geometry_geohash_grid_frequency_precision',
    1,
    maxGeohashPrecision
  )
  // const geometryGeohexGridPrecision = extractPrecision(
  //   parameters,
  //   'geometry_geohex_grid_frequency_precision',
  //   0,
  //   maxGeohexPrecision
  // )
  const geometryGeotileGridPrecision = extractPrecision(
    parameters,
    'geometry_geotile_grid_frequency_precision',
    0,
    maxGeotilePrecision
  )

  let dbResponse
  try {
    dbResponse = await backend.aggregate(
      aggregationsRequested,
      searchParams,
      geohashPrecision,
      geohexPrecision,
      geotilePrecision,
      centroidGeohashGridPrecision,
      centroidGeohexGridPrecision,
      centroidGeotileGridPrecision,
      geometryGeohashGridPrecision,
      // geometryGeohexGridPrecision,
      geometryGeotileGridPrecision,
    )
  } catch (error) {
    if (!isIndexNotFoundError(error)) {
      throw error
    }
  }

  const aggregations = []

  if (dbResponse) {
    const { body: { aggregations: resultAggs } } = dbResponse

    if (aggregationsRequested.includes('total_count')) {
      aggregations.push({
        name: 'total_count',
        data_type: 'integer',
        value: (resultAggs['total_count'] || {})['value'] || 0,
      })
    }

    if (aggregationsRequested.includes('datetime_max')) {
      aggregations.push({
        name: 'datetime_max',
        data_type: 'datetime',
        value: (resultAggs['datetime_max'] || {})['value_as_string'] || null,
      })
    }

    if (aggregationsRequested.includes('datetime_min')) {
      aggregations.push({
        name: 'datetime_min',
        data_type: 'datetime',
        value: (resultAggs['datetime_min'] || {})['value_as_string'] || null,
      })
    }

    const otherAggregations = new Map([
      ['collection_frequency', 'string'],
      ['grid_code_frequency', 'string'],
      ['grid_geohash_frequency', 'string'],
      ['grid_geohex_frequency', 'string'],
      ['grid_geotile_frequency', 'string'],
      ['centroid_geohash_grid_frequency', 'string'],
      ['centroid_geohex_grid_frequency', 'string'],
      ['centroid_geotile_grid_frequency', 'string'],
      ['geometry_geohash_grid_frequency', 'string'],
      // ['geometry_geohex_grid_frequency', 'string'],
      ['geometry_geotile_grid_frequency', 'string'],
      ['platform_frequency', 'string'],
      ['sun_elevation_frequency', 'string'],
      ['sun_azimuth_frequency', 'string'],
      ['off_nadir_frequency', 'string'],
      ['datetime_frequency', 'datetime'],
      ['cloud_cover_frequency', 'numeric'],
    ])

    for (const [k, v] of otherAggregations.entries()) {
      if (aggregationsRequested.includes(k)) {
        aggregations.push(agg(resultAggs, k, v))
      }
    }
  }

  const results = {
    aggregations,
    links: [
      {
        rel: 'self',
        type: 'application/json',
        href: `${linkEndpoint}/aggregate`
      },
      {
        rel: 'root',
        type: 'application/json',
        href: `${endpoint}`
      }]
  }
  if (collectionEndpoint) {
    results.links.push({
      rel: 'collection',
      type: 'application/json',
      href: collectionEndpoint
    })
  }
  return results
}

const getConformance = async function (txnEnabled: boolean): Promise<string[]> {
  const foundationPrefix = 'https://api.stacspec.org/v1.0.0'
  const conformsTo = [
    `${foundationPrefix}/core`,
    `${foundationPrefix}/collections`,
    `${foundationPrefix}/ogcapi-features`,
    `${foundationPrefix}/item-search`,
    `${foundationPrefix}/ogcapi-features#fields`,
    `${foundationPrefix}/ogcapi-features#sort`,
    `${foundationPrefix}/ogcapi-features#query`,
    `${foundationPrefix}/item-search#fields`,
    `${foundationPrefix}/item-search#sort`,
    `${foundationPrefix}/item-search#query`,
    `${foundationPrefix}/item-search#filter`,
    'https://api.stacspec.org/v0.3.0/aggregation',
    'https://api.stacspec.org/v0.3.0/aggregation#query',
    'https://api.stacspec.org/v0.3.0/aggregation#filter',
    'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core',
    'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/oas30',
    'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson',
    'http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/filter',
    'http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/features-filter',
    'http://www.opengis.net/spec/cql2/1.0/conf/basic-cql2',
    'http://www.opengis.net/spec/cql2/1.0/conf/cql2-json',
    'http://www.opengis.net/spec/cql2/1.0/conf/basic-spatial-functions',
    'http://www.opengis.net/spec/cql2/1.0/conf/basic-spatial-functions-plus',
  ]

  if (txnEnabled) {
    conformsTo.push(`${foundationPrefix}-rc.3/ogcapi-features/extensions/transaction`)
  }

  return { conformsTo }
}

const DEFAULT_QUERYABLES = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {},
  additionalProperties: true
}

const getGlobalQueryables = async (endpoint = '') => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${endpoint}/queryables`,
  type: 'object',
  title: `Queryables for ${process.env['STAC_TITLE'] || 'STAC API'}`,
  properties: {},
  additionalProperties: true
})

const validateAdditionalProperties = (queryables) => {
  if ('additionalProperties' in queryables) {
    const additionalProperties = queryables.additionalProperties
    if (additionalProperties !== true) {
      throw new ValidationError(
        `Unsupported additionalProperties value: "${additionalProperties}". Must be set to "true".`
      )
    }
  }
}

const getCollectionQueryables = async (backend, collectionId, endpoint, parameters, headers) => {
  const allowedCollectionIds = extractAllowedCollectionIds(parameters, headers)
  if (!isCollectionIdAllowed(allowedCollectionIds, collectionId)) {
    return new NotFoundError()
  }

  const collection = await backend.getCollection(collectionId)

  if (collection instanceof Error) {
    return collection
  }
  const queryables = collection.queryables || { ...DEFAULT_QUERYABLES }
  validateAdditionalProperties(queryables)
  queryables.$id = `${endpoint}/collections/${collectionId}/queryables`
  queryables.title = `Queryables for Collection ${collectionId}`
  return queryables
}

const getCollectionAggregations = async (backend, collectionId, endpoint, parameters, headers) => {
  if (!isCollectionIdAllowed(extractAllowedCollectionIds(parameters, headers), collectionId)) {
    return new NotFoundError()
  }

  const collection = await backend.getCollection(collectionId)

  if (collection instanceof Error) {
    return collection
  }
  const aggregations = collection?.aggregations || DEFAULT_AGGREGATIONS

  const links = [
    {
      rel: 'root',
      type: 'application/json',
      href: `${endpoint}`
    },
    {
      rel: 'self',
      type: 'application/json',
      href: `${endpoint}/collections/${collectionId}/aggregations`
    },
    {
      rel: 'collection',
      type: 'application/json',
      href: `${endpoint}/collections/${collectionId}`
    }
  ]

  return { aggregations, links }
}

const getGlobalAggregations = async (endpoint = '') => {
  const aggregations = DEFAULT_AGGREGATIONS
  const links = [
    {
      rel: 'root',
      type: 'application/json',
      href: `${endpoint}`
    }, {
      rel: 'self',
      type: 'application/json',
      href: `${endpoint}/aggregations`
    }
  ]

  return { aggregations, links }
}

const getCatalog = async function (txnEnabled, endpoint = '') {
  const links = [
    {
      rel: 'self',
      type: 'application/json',
      href: `${endpoint}`,
      title: 'Root Catalog'
    },
    {
      rel: 'root',
      type: 'application/json',
      href: `${endpoint}`,
      title: 'Root Catalog'
    },
    {
      rel: 'conformance',
      type: 'application/json',
      href: `${endpoint}/conformance`,
      title: 'STAC/OGC confromance classes'
    },
    {
      rel: 'data',
      type: 'application/json',
      href: `${endpoint}/collections`,
      title: 'Collections'
    },
    {
      rel: 'search',
      type: 'application/geo+json',
      href: `${endpoint}/search`,
      method: 'GET',
      title: 'STAC search [GET]'
    },
    {
      rel: 'search',
      type: 'application/geo+json',
      href: `${endpoint}/search`,
      method: 'POST',
      title: 'STAC search [POST]'
    },
    {
      rel: 'aggregate',
      type: 'application/json',
      href: `${endpoint}/aggregate`,
      method: 'GET',
      title: 'STAC aggregate [GET]'
    },
    {
      rel: 'aggregations',
      type: 'application/json',
      href: `${endpoint}/aggregations`,
      title: 'Aggregations'
    },
    {
      rel: 'service-desc',
      type: 'application/vnd.oai.openapi',
      href: `${endpoint}/api`,
      title: 'OpenAPI service description'
    },
    {
      rel: 'service-doc',
      type: 'text/html',
      href: `${endpoint}/api.html`,
      title: 'OpenAPI service documentation'
    },
    {
      rel: 'http://www.opengis.net/def/rel/ogc/1.0/queryables',
      type: 'application/schema+json',
      href: `${endpoint}/queryables`,
      title: 'Queryables'
    },
  ]

  if (process.env['STAC_DOCS_URL']) {
    links.push({
      rel: 'server',
      type: 'text/html',
      href: process.env['STAC_DOCS_URL'],
      title: 'API documentation'
    })
  }

  return {
    stac_version: '1.1.0',
    type: 'Catalog',
    id: process.env['STAC_ID'] || 'stac-server',
    title: process.env['STAC_TITLE'] || 'A STAC API',
    description: process.env['STAC_DESCRIPTION'] || 'A STAC API running on stac-server',
    conformsTo: (await getConformance(txnEnabled)).conformsTo,
    links
  }
}

const deleteUnusedFields = (collection) => {
  // delete fields in the collection object that are not part of the STAC Collection
  delete collection.queryables
  delete collection.aggregations
}

const getCollections = async function (backend, endpoint, parameters, headers) {
  // TODO: implement proper pagination, as this will only return up to
  // COLLECTION_LIMIT collections
  const collectionsOrError = await backend.getCollections(1, COLLECTION_LIMIT)
  if (collectionsOrError instanceof Error) {
    return collectionsOrError
  }

  const allowedCollectionIds = extractAllowedCollectionIds(parameters, headers)
  const collections = collectionsOrError.filter(
    (c) => isCollectionIdAllowed(allowedCollectionIds, c.id)
  )

  for (const collection of collections) {
    deleteUnusedFields(collection)
  }

  addCollectionLinks(collections, endpoint)

  const resp = {
    collections,
    links: [
      {
        rel: 'self',
        type: 'application/json',
        href: `${endpoint}/collections`,
        title: 'Collections'
      },
      {
        rel: 'root',
        type: 'application/json',
        href: `${endpoint}`,
        title: 'Root Catalog'
      },
    ],
  }

  // note: adding this to the Collections response is not
  // part of the Context Extension, and was just a proprietary
  // behavior of this implemenation
  if (process.env['ENABLE_CONTEXT_EXTENSION']) {
    resp['context'] = {
      page: 1,
      limit: COLLECTION_LIMIT,
      matched: collections && collections.length,
      returned: collections && collections.length
    }
  }
  return resp
}

const getCollection = async function (backend, collectionId, endpoint, parameters, headers) {
  if (!isCollectionIdAllowed(extractAllowedCollectionIds(parameters, headers), collectionId)) {
    return new NotFoundError()
  }

  const result = await backend.getCollection(collectionId)
  if (result instanceof Error) {
    return new NotFoundError()
  }

  deleteUnusedFields(result)
  addCollectionLinks([result], endpoint)

  return result
}

const createCollection = async function (backend, collection) {
  const response = await backend.indexCollection(collection)
  logger.debug('Create Collection: %j', response)

  if (response) {
    return response
  }
  return new Error(`Error creating collection ${collection}`)
}

const getItem = async function (backend, collectionId, itemId, endpoint, params, headers) {
  if (!isCollectionIdAllowed(extractAllowedCollectionIds(params, headers), collectionId)) {
    return new NotFoundError()
  }

  const itemQuery = {
    collections: [collectionId],
    id: itemId,
    filter: extractRestrictionCql2Filter(params, headers)
  }

  const { results } = await backend.search(itemQuery, 1)

  addItemLinks(results, endpoint)

  const [it] = results
  if (it) {
    return it
  }
  return new NotFoundError()
}

const partialUpdateItem = async function (backend,
  collectionId, itemId, endpoint, parameters) {
  const response = await backend.partialUpdateItem(collectionId, itemId, parameters)
  logger.debug('Partial Update Item: %j', response)
  if (response) {
    const items = addItemLinks([response.body.get._source], endpoint)
    return items[0]
  }
  return new Error(`Error partially updating item ${itemId}`)
}

const createItem = async function (backend, item) {
  const response = await backend.indexItem(item)
  logger.debug('Create Item: %j', response)

  if (response) {
    return response
  }
  return new Error(`Error creating item in collection ${item.collection}`)
}

const updateItem = async function (backend, item) {
  const response = await backend.updateItem(item)
  logger.debug('Update Item: %j', response)

  if (response) {
    return response
  }
  return new Error(`Error updating item ${item.id}`)
}

const deleteItem = async function (backend, collectionId, itemId) {
  const response = await backend.deleteItem(collectionId, itemId)
  logger.debug('Delete Item: %j', response)
  if (response) {
    return response
  }
  return new Error(`Error deleting item ${collectionId}/${itemId}`)
}

const getItemThumbnail = async function (backend, collectionId, itemId, parameters, headers) {
  if (process.env['ENABLE_THUMBNAILS'] !== 'true') {
    return new NotFoundError()
  }

  if (!isCollectionIdAllowed(extractAllowedCollectionIds(parameters, headers), collectionId)) {
    return new NotFoundError()
  }

  const itemQuery = {
    collections: [collectionId],
    id: itemId,
    filter: extractRestrictionCql2Filter(parameters, headers)
  }
  const { results } = await backend.search(itemQuery, 1)
  const [item] = results
  if (!item) {
    return new NotFoundError()
  }

  const thumbnailAsset = Object.values(item.assets || []).find(
    (x) => x.roles && x.roles.includes('thumbnail')
  )

  if (!thumbnailAsset) {
    return new NotFoundError()
  }

  let location
  if (thumbnailAsset.href && thumbnailAsset.href.startsWith('http')) {
    location = thumbnailAsset.href
  } else if (thumbnailAsset.href && thumbnailAsset.href.startsWith('s3')) {
    const region = thumbnailAsset['storage:region']
                  || item.properties['storage:region']
                  || process.env['AWS_REGION']
                  || 'us-west-2'
    const withoutProtocol = thumbnailAsset.href.substring(5) // chop off s3://
    const [bucket, ...keyArray] = withoutProtocol.split('/')
    const key = keyArray.join('/')

    const client = new S3Client({ region })
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      RequestPayer: 'requester'
    })
    location = await getSignedUrl(client, command, {
      expiresIn: 60 * 5, // expiry in seconds
    })
  } else {
    return new NotFoundError()
  }

  return { location }
}

const healthCheck = async function (backend) {
  const response = await backend.healthCheck()
  if (response && response.statusCode === 200) {
    return { status: 'ok' }
  }
  logger.error('Health check error: %j', response)
  return new Error('Error with health check.')
}

export default {
  getConformance,
  getCatalog,
  getCollections,
  getCollection,
  createCollection,
  getItem,
  searchItems,
  parsePath,
  extractIntersects,
  extractBbox,
  createItem,
  deleteItem,
  updateItem,
  partialUpdateItem,
  ValidationError,
  extractLimit,
  extractDatetime,
  aggregate,
  getItemThumbnail,
  healthCheck,
  getGlobalQueryables,
  getCollectionQueryables,
  getGlobalAggregations,
  getCollectionAggregations,
}

export {
  extractLimit,
  extractPrecision,
  extractAggregations,
  extractPage,
  extractDatetime,
  createQueryFields,
  extractFields,
  extractBbox,
  extractIntersects,
  extractStacQuery,
  extractCql2Filter,
  extractRestrictionCql2Filter,
  concatenateCql2Filters,
} from './api-utils.js'
