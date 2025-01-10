import { pickBy, assign, get as getNested } from 'lodash-es'
import extent from '@mapbox/extent'
import { DateTime } from 'luxon'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

import { isIndexNotFoundError } from './database.js'
import logger from './logger.js'

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

export class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
  }
}

export const extractIntersects = function (params) {
  let intersectsGeometry
  const { intersects } = params
  if (intersects) {
    let geojson
    // if we receive a string, try to parse as GeoJSON, otherwise assume it is GeoJSON
    if (typeof intersects === 'string') {
      try {
        geojson = JSON.parse(intersects)
      } catch (e) {
        throw new ValidationError('Invalid GeoJSON geometry')
      }
    } else {
      geojson = { ...intersects }
    }

    if (geojson.type === 'FeatureCollection' || geojson.type === 'Feature') {
      throw new Error(
        'Expected GeoJSON geometry, not Feature or FeatureCollection'
      )
    }
    intersectsGeometry = geojson
  }
  return intersectsGeometry
}

export const extractBbox = function (params, httpMethod = 'GET') {
  const { bbox } = params
  if (bbox) {
    let bboxArray
    if (httpMethod === 'GET' && typeof bbox === 'string') {
      try {
        bboxArray = bbox.split(',').map(parseFloat).filter((x) => !Number.isNaN(x))
      } catch (e2) {
        throw new ValidationError('Invalid bbox')
      }
    } else if (httpMethod === 'POST' && Array.isArray(bbox)) {
      bboxArray = bbox
    } else {
      throw new ValidationError('Invalid bbox')
    }

    if (bboxArray.length !== 4 && bboxArray.length !== 6) {
      throw new ValidationError('Invalid bbox, must have 4 or 6 points')
    }

    if ((bboxArray.length === 4 && bboxArray[1] > bboxArray[3])
        || (bboxArray.length === 6 && bboxArray[1] > bboxArray[4])) {
      throw new ValidationError('Invalid bbox, SW latitude must be less than NE latitude')
    }

    return extent(bboxArray).polygon()
  }
  return undefined
}

export const extractLimit = function (params) {
  const { limit: limitStr } = params

  if (limitStr !== undefined) {
    let limit
    try {
      limit = parseInt(limitStr)
    } catch (e) {
      throw new ValidationError('Invalid limit value')
    }

    if (Number.isNaN(limit) || limit <= 0) {
      throw new ValidationError(
        'Invalid limit value, must be a number between 1 and 10000 inclusive'
      )
    }
    if (limit > 10000) {
      limit = 10000
    }
    return limit
  }
  return undefined
}

export const extractPrecision = function (params, name, min, max) {
  const precisionStr = params[name]

  if (precisionStr !== undefined) {
    let precision
    try {
      precision = parseInt(precisionStr)
    } catch (e) {
      throw new ValidationError(`Invalid precision value for ${name}`)
    }

    if (Number.isNaN(precision) || precision < min || precision > max) {
      throw new ValidationError(
        `Invalid precision value for ${name}, must be a number between ${min} and ${max} inclusive`
      )
    }
    return precision
  }

  return min
}

export const extractAggregations = function (params) {
  let aggs
  const { aggregations } = params
  if (aggregations) {
    if (typeof aggregations === 'string') {
      try {
        aggs = JSON.parse(aggregations)
      } catch (e) {
        aggs = aggregations.split(',')
      }
    } else {
      aggs = aggregations.slice()
    }
  }
  return aggs || []
}

export const extractPage = function (params) {
  const { page: pageStr } = params

  if (pageStr !== undefined) {
    let page
    try {
      page = parseInt(pageStr)
    } catch (e) {
      throw new ValidationError('Invalid page value')
    }

    if (Number.isNaN(page) || page <= 0) {
      throw new ValidationError(
        'Invalid page value, must be a number greater than 1'
      )
    }
    return page
  }
  return undefined
}

// eslint-disable-next-line max-len
const RFC3339_REGEX = /^(\d\d\d\d)\-(\d\d)\-(\d\d)T(\d\d):(\d\d):(\d\d)([.]\d+)?(Z|([-+])(\d\d):(\d\d))$/

const rfc3339ToDateTime = function (s) {
  if (!RFC3339_REGEX.test(s)) {
    throw new ValidationError('datetime value is invalid, does not match RFC3339 format')
  }
  const dt = DateTime.fromISO(s)
  if (dt.isValid) {
    return dt
  }
  throw new ValidationError(
    `datetime value is invalid, ${dt.invalidReason} ${dt.invalidExplanation}'`
  )
}

const validateStartAndEndDatetimes = function (startDateTime, endDateTime) {
  if (startDateTime && endDateTime && endDateTime < startDateTime) {
    throw new ValidationError(
      'datetime value is invalid, start datetime must be before end datetime with interval'
    )
  }
}

export const extractDatetime = function (params) {
  const { datetime } = params

  if (datetime) {
    const datetimeUpperCase = datetime.toUpperCase()
    const [start, end, ...rest] = datetimeUpperCase.split('/')
    if (rest.length) {
      throw new ValidationError(
        'datetime value is invalid, too many forward slashes for an interval'
      )
    } else if ((!start && !end)
        || (start === '..' && end === '..')
        || (!start && end === '..')
        || (start === '..' && !end)
    ) {
      throw new ValidationError(
        'datetime value is invalid, at least one end of the interval must be closed'
      )
    } else {
      const startDateTime = (start && start !== '..') ? rfc3339ToDateTime(start) : undefined
      const endDateTime = (end && end !== '..') ? rfc3339ToDateTime(end) : undefined
      validateStartAndEndDatetimes(startDateTime, endDateTime)
    }
    return datetimeUpperCase
  }
  return undefined
}

const extractStacQuery = function (params) {
  let stacQuery
  const { query } = params
  if (query) {
    if (typeof query === 'string') {
      const parsed = JSON.parse(query)
      stacQuery = parsed
    } else {
      stacQuery = { ...query }
    }
  }
  return stacQuery
}

const extractCql2Filter = function (params) {
  let cql2Filter
  const { filter } = params
  if (filter) {
    if (typeof filter !== 'object') {
      throw new ValidationError('Invalid filter value, must be a JSON object')
    } else {
      cql2Filter = { ...filter }
    }
  }
  return cql2Filter
}

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

const extractFields = function (params) {
  let fieldRules
  const { fields } = params
  if (fields) {
    if (typeof fields === 'string') {
      // GET request - different syntax
      const _fields = fields.split(',')
      const include = []
      _fields.forEach((fieldRule) => {
        if (fieldRule[0] !== '-') {
          include.push(fieldRule)
        }
      })
      const exclude = []
      _fields.forEach((fieldRule) => {
        if (fieldRule[0] === '-') {
          exclude.push(fieldRule.slice(1))
        }
      })
      fieldRules = { include, exclude }
    } else {
      // POST request - JSON
      fieldRules = fields
    }
  } else if (params.hasOwnProperty('fields')) {
    // fields was provided as an empty object
    fieldRules = {}
  }
  return fieldRules
}

const extractIds = function (params) {
  let idsRules
  const { ids } = params
  if (ids) {
    if (typeof ids === 'string') {
      try {
        idsRules = JSON.parse(ids)
      } catch (e) {
        idsRules = ids.split(',')
      }
    } else {
      idsRules = ids.slice()
    }
  }
  return idsRules
}

const extractCollectionIds = function (params) {
  let idsRules
  const { collections } = params
  if (collections) {
    if (typeof collections === 'string') {
      try {
        idsRules = JSON.parse(collections)
      } catch (e) {
        idsRules = collections.split(',')
      }
    } else {
      idsRules = collections.slice()
    }
  }
  return idsRules
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
      href: `${endpoint}/collections/${id}`
    })
    // parent catalog
    links.push({
      rel: 'parent',
      type: 'application/json',
      href: `${endpoint}`
    })
    // root catalog
    links.push({
      rel: 'root',
      type: 'application/json',
      href: `${endpoint}`
    })
    // child items
    links.push({
      rel: 'items',
      type: 'application/geo+json',
      href: `${endpoint}/collections/${id}/items`
    })
    // queryables
    links.push({
      rel: 'http://www.opengis.net/def/rel/ogc/1.0/queryables',
      type: 'application/schema+json',
      href: `${endpoint}/collections/${id}/queryables`
    })
    links.push({
      rel: 'aggregate',
      type: 'application/json',
      href: `${endpoint}/collections/${id}/aggregate`,
      method: 'GET'
    })
    links.push({
      rel: 'aggregations',
      type: 'application/json',
      href: `${endpoint}/collections/${id}/aggregations`
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
    links.push({
      rel: 'thumbnail',
      href: `${endpoint}/collections/${collection}/items/${id}/thumbnail`
    })
    result.type = 'Feature'
    return result
  })
  return results
}

const collectionsToCatalogLinks = function (results, endpoint) {
  const stacVersion = process.env['STAC_VERSION'] || '1.0.0'
  const catalogId = process.env['STAC_ID'] || 'stac-server'
  const catalogTitle = process.env['STAC_TITLE'] || 'A STAC API'
  const catalogDescription = process.env['STAC_DESCRIPTION'] || 'A STAC API running on stac-server'
  const catalog = {
    stac_version: stacVersion,
    type: 'Catalog',
    id: catalogId,
    title: catalogTitle,
    description: catalogDescription
  }

  catalog.links = results.map((result) => {
    const { id } = result
    return {
      rel: 'child',
      type: 'application/geo+json',
      href: `${endpoint}/collections/${id}`
    }
  })
  return catalog
}

const wrapResponseInFeatureCollection = function (
  context, features = [], links = []
) {
  return {
    type: 'FeatureCollection',
    stac_version: process.env['STAC_VERSION'] || '1.0.0',
    stac_extensions: [],
    context,
    numberMatched: context.matched,
    numberReturned: context.returned,
    features,
    links
  }
}

const buildPaginationLinks = function (limit, parameters, bbox, intersects, endpoint,
  httpMethod, sortby, items) {
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
            } else if (p === 'collections') {
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

    const lastItem = items[items.length - 1]

    const nextKeys = sortby ? sortby.map((x) => x.field)
      : ['properties.datetime', 'id', 'collection']

    const next = nextKeys.map((k) => getNested(lastItem, k)).join(',')

    if (next) {
      const link = {
        rel: 'next',
        title: 'Next page of Items',
        method: httpMethod,
        type: 'application/geo+json'
      }
      const nextParams = pickBy(assign(parameters, { bbox, intersects, limit, next }))
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

const searchItems = async function (collectionId, queryParameters, backend, endpoint, httpMethod) {
  logger.debug('Search parameters (unprocessed): %j', queryParameters)
  const {
    next,
    bbox,
    intersects
  } = queryParameters
  if (bbox && intersects) {
    throw new ValidationError('Expected bbox OR intersects, not both')
  }
  const datetime = extractDatetime(queryParameters)
  const bboxGeometry = extractBbox(queryParameters, httpMethod)
  const intersectsGeometry = extractIntersects(queryParameters)
  const geometry = intersectsGeometry || bboxGeometry

  const sortby = extractSortby(queryParameters)
  const query = extractStacQuery(queryParameters)
  const filter = extractCql2Filter(queryParameters)
  const fields = extractFields(queryParameters)
  const ids = extractIds(queryParameters)
  const collections = extractCollectionIds(queryParameters)
  const limit = extractLimit(queryParameters)
  const page = extractPage(queryParameters)

  const searchParams = pickBy({
    datetime,
    intersects: geometry,
    query,
    filter,
    sortby,
    fields,
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
    esResponse = await backend.search(searchParams, page, limit)
  } catch (error) {
    if (isIndexNotFoundError(error)) {
      esResponse = {
        context: {
          matched: 0,
          returned: 0,
          limit
        },
        results: []
      }
    // @ts-ignore
    } else if (error?.meta?.statusCode === 400) {
      // @ts-ignore
      const e = error?.meta?.body?.error

      // only serialize part of the error message,
      // as error.meta.meta.connection will leak the OpenSearch URL
      let errorMessage
      if ('caused_by' in e) {
        errorMessage = JSON.stringify(e?.caused_by?.reason)
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

  const { results: responseItems, context } = esResponse
  const paginationLinks = buildPaginationLinks(
    limit, searchParams, bbox, intersects, newEndpoint, httpMethod, sortby, responseItems
  )

  // @ts-ignore
  const links = paginationLinks.concat([{
    rel: 'root',
    type: 'application/json',
    href: endpoint
  }])

  if (collectionId) { // add these links for a features request
    // @ts-ignore
    links.push({
      rel: 'self',
      type: 'application/geo+json',
      href: newEndpoint
    })
    // @ts-ignore
    links.push({
      rel: 'collection',
      type: 'application/json',
      href: collectionEndpoint
    })
  }

  const items = addItemLinks(responseItems, endpoint)
  const response = wrapResponseInFeatureCollection(context, items, links)
  return response
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
  collectionId, queryParameters, backend, endpoint, httpMethod
) {
  logger.debug('Aggregate parameters (unprocessed): %j', queryParameters)

  const {
    bbox,
    intersects
  } = queryParameters
  if (bbox && intersects) {
    throw new ValidationError('Expected bbox OR intersects, not both')
  }
  const datetime = extractDatetime(queryParameters)
  const bboxGeometry = extractBbox(queryParameters, httpMethod)
  const intersectsGeometry = extractIntersects(queryParameters)
  const geometry = intersectsGeometry || bboxGeometry
  const query = extractStacQuery(queryParameters)
  const ids = extractIds(queryParameters)
  const collections = extractCollectionIds(queryParameters)

  const searchParams = pickBy({
    datetime,
    intersects: geometry,
    query,
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

  const aggregationsRequested = extractAggregations(queryParameters)

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
    queryParameters,
    'grid_geohash_frequency_precision',
    1,
    maxGeohashPrecision
  )
  const geohexPrecision = extractPrecision(
    queryParameters,
    'grid_geohex_frequency_precision',
    0,
    maxGeohexPrecision
  )
  const geotilePrecision = extractPrecision(
    queryParameters,
    'grid_geotile_frequency_precision',
    0,
    maxGeotilePrecision
  )

  const centroidGeohashGridPrecision = extractPrecision(
    queryParameters,
    'centroid_geohash_grid_frequency_precision',
    1,
    maxGeohashPrecision
  )
  const centroidGeohexGridPrecision = extractPrecision(
    queryParameters,
    'centroid_geohex_grid_frequency_precision',
    0,
    maxGeohexPrecision
  )
  const centroidGeotileGridPrecision = extractPrecision(
    queryParameters,
    'centroid_geotile_grid_frequency_precision',
    0,
    maxGeotilePrecision
  )

  const geometryGeohashGridPrecision = extractPrecision(
    queryParameters,
    'geometry_geohash_grid_frequency_precision',
    1,
    maxGeohashPrecision
  )
  // const geometryGeohexGridPrecision = extractPrecision(
  //   queryParameters,
  //   'geometry_geohex_grid_frequency_precision',
  //   0,
  //   maxGeohexPrecision
  // )
  const geometryGeotileGridPrecision = extractPrecision(
    queryParameters,
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

const getConformance = async function (txnEnabled) {
  const foundationPrefix = 'https://api.stacspec.org/v1.0.0'
  const conformsTo = [
    `${foundationPrefix}/core`,
    `${foundationPrefix}/collections`,
    `${foundationPrefix}/ogcapi-features`,
    `${foundationPrefix}/item-search`,
    'https://api.stacspec.org/v1.0.0/ogcapi-features#fields',
    'https://api.stacspec.org/v1.0.0/ogcapi-features#sort',
    'https://api.stacspec.org/v1.0.0/ogcapi-features#query',
    'https://api.stacspec.org/v1.0.0/item-search#fields',
    'https://api.stacspec.org/v1.0.0/item-search#sort',
    'https://api.stacspec.org/v1.0.0/item-search#query',
    'https://api.stacspec.org/v0.3.0/aggregation',
    'https://api.stacspec.org/v1.0.0/item-search#filter',
    'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core',
    'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/oas30',
    'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson',
    'http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/filter',
    'http://www.opengis.net/spec/cql2/1.0/conf/basic-cql2',
    'http://www.opengis.net/spec/cql2/1.0/conf/cql2-json'
  ]

  if (txnEnabled) {
    conformsTo.push('https://api.stacspec.org/v1.0.0-rc.3/ogcapi-features/extensions/transaction')
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

const getCollectionQueryables = async (collectionId, backend, endpoint = '') => {
  const collection = await backend.getCollection(collectionId)

  if (collection instanceof Error) {
    return collection
  }
  const queryables = collection.queryables || { ...DEFAULT_QUERYABLES }
  queryables.$id = `${endpoint}/collections/${collectionId}/queryables`
  queryables.title = `Queryables for Collection ${collectionId}`
  return queryables
}

const getCollectionAggregations = async (collectionId, backend, endpoint = '') => {
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

const getCatalog = async function (txnEnabled, backend, endpoint = '') {
  const collectionsOrError = await backend.getCollections(1, COLLECTION_LIMIT)
  if (collectionsOrError instanceof Error) {
    return collectionsOrError
  }

  const catalog = collectionsToCatalogLinks(collectionsOrError, endpoint)

  catalog.conformsTo = (await getConformance(txnEnabled)).conformsTo

  const links = [
    {
      rel: 'self',
      type: 'application/json',
      href: `${endpoint}`
    },
    {
      rel: 'root',
      type: 'application/json',
      href: `${endpoint}`
    },
    {
      rel: 'conformance',
      type: 'application/json',
      href: `${endpoint}/conformance`
    },
    {
      rel: 'data',
      type: 'application/json',
      href: `${endpoint}/collections`
    },
    {
      rel: 'search',
      type: 'application/geo+json',
      href: `${endpoint}/search`,
      method: 'GET',
    },
    {
      rel: 'search',
      type: 'application/geo+json',
      href: `${endpoint}/search`,
      method: 'POST',
    },
    {
      rel: 'aggregate',
      type: 'application/json',
      href: `${endpoint}/aggregate`,
      method: 'GET',
    },
    {
      rel: 'aggregations',
      type: 'application/json',
      href: `${endpoint}/aggregations`
    },
    {
      rel: 'service-desc',
      type: 'application/vnd.oai.openapi',
      href: `${endpoint}/api`
    },
    {
      rel: 'service-doc',
      type: 'text/html',
      href: `${endpoint}/api.html`
    },
    {
      rel: 'http://www.opengis.net/def/rel/ogc/1.0/queryables',
      type: 'application/schema+json',
      href: `${endpoint}/queryables`
    },
  ]

  const docsUrl = process.env['STAC_DOCS_URL']
  if (docsUrl) {
    links.push({
      rel: 'server',
      type: 'text/html',
      href: docsUrl,
    })
  }

  catalog.links = links.concat(catalog.links)

  return catalog
}

const deleteUnusedFields = (collection) => {
  // delete fields in the collection object that are not part of the STAC Collection
  delete collection.queryables
  delete collection.aggregations
}

const getCollections = async function (backend, endpoint = '') {
  // TODO: implement proper pagination, as this will only return up to
  // COLLECTION_LIMIT collections
  const collectionsOrError = await backend.getCollections(1, COLLECTION_LIMIT)
  if (collectionsOrError instanceof Error) {
    return collectionsOrError
  }

  for (const collection of collectionsOrError) {
    deleteUnusedFields(collection)
  }

  const linkedCollections = addCollectionLinks(collectionsOrError, endpoint)
  const resp = {
    collections: collectionsOrError,
    links: [
      {
        rel: 'self',
        type: 'application/json',
        href: `${endpoint}/collections`,
      },
      {
        rel: 'root',
        type: 'application/json',
        href: `${endpoint}`,
      },
    ],
    context: {
      page: 1,
      limit: COLLECTION_LIMIT,
      matched: linkedCollections && linkedCollections.length,
      returned: linkedCollections && linkedCollections.length
    }
  }
  return resp
}

const getCollection = async function (collectionId, backend, endpoint = '') {
  const result = await backend.getCollection(collectionId)
  if (result instanceof Error) {
    return new Error('Collection not found')
  }

  deleteUnusedFields(result)

  const col = addCollectionLinks([result], endpoint)
  if (col.length > 0) {
    return col[0]
  }
  return new Error('Collection retrieval failed')
}

const createCollection = async function (collection, backend) {
  const response = await backend.indexCollection(collection)
  logger.debug('Create Collection: %j', response)

  if (response) {
    return response
  }
  return new Error(`Error creating collection ${collection}`)
}

const getItem = async function (collectionId, itemId, backend, endpoint = '') {
  const itemQuery = { collections: [collectionId], id: itemId }
  const { results } = await backend.search(itemQuery)
  const [it] = addItemLinks(results, endpoint)
  if (it) {
    return it
  }
  return new Error('Item not found')
}

const partialUpdateItem = async function (
  collectionId, itemId, queryParameters, backend, endpoint = ''
) {
  const response = await backend.partialUpdateItem(collectionId, itemId, queryParameters)
  logger.debug('Partial Update Item: %j', response)
  if (response) {
    return addItemLinks([response.body.get._source], endpoint)[0]
  }
  return new Error(`Error partially updating item ${itemId}`)
}

const createItem = async function (item, backend) {
  const response = await backend.indexItem(item)
  logger.debug('Create Item: %j', response)

  if (response) {
    return response
  }
  return new Error(`Error creating item in collection ${item.collection}`)
}

const updateItem = async function (item, backend) {
  const response = await backend.updateItem(item)
  logger.debug('Update Item: %j', response)

  if (response) {
    return response
  }
  return new Error(`Error updating item ${item.id}`)
}

const deleteItem = async function (collectionId, itemId, backend) {
  const response = await backend.deleteItem(collectionId, itemId)
  logger.debug('Delete Item: %j', response)
  if (response) {
    return response
  }
  return new Error(`Error deleting item ${collectionId}/${itemId}`)
}

const getItemThumbnail = async function (collectionId, itemId, backend) {
  const itemQuery = { collections: [collectionId], id: itemId }
  const { results } = await backend.search(itemQuery)
  const [item] = results
  if (!item) {
    return new Error('Item not found')
  }

  const thumbnailAsset = Object.values(item.assets || []).find(
    (x) => x.roles && x.roles.includes('thumbnail')
  )

  if (!thumbnailAsset) {
    return new Error('Thumbnail not found')
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
    return new Error('Thumbnail not found')
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
