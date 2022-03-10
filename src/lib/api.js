const { pickBy, assign } = require('lodash')
const gjv = require('geojson-validation')
const extent = require('@mapbox/extent')
const { DateTime } = require('luxon')
const { isIndexNotFoundError } = require('./es')
const logger = console

// max number of collections to retrieve
const COLLECTION_LIMIT = process.env.STAC_SERVER_COLLECTION_LIMIT || 100

class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
  }
}

const extractIntersects = function (params) {
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

    if (gjv.valid(geojson)) {
      if (geojson.type === 'FeatureCollection' || geojson.type === 'Feature') {
        throw new Error(
          'Expected GeoJSON geometry, not Feature or FeatureCollection'
        )
      }
      intersectsGeometry = geojson
    } else {
      throw new ValidationError('Invalid GeoJSON geometry')
    }
  }
  return intersectsGeometry
}

const extractBbox = function (params) {
  const { bbox } = params
  if (bbox) {
    let bboxArray
    if (typeof bbox === 'string') {
      try {
        bboxArray = JSON.parse(bbox)
      } catch (e) {
        try {
          bboxArray = bbox.split(',').map(parseFloat)
        } catch (e2) {
          throw new ValidationError('Invalid bbox')
        }
      }
    } else {
      bboxArray = bbox
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

const extractLimit = function (params) {
  const { limit: limitStr } = params

  if (limitStr !== undefined) {
    let limit
    try {
      limit = parseInt(limitStr)
    } catch (e) {
      throw new ValidationError('Invalid limit value')
    }

    if (Number.isNaN(limit) || limit <= 0 || limit > 10000) {
      throw new ValidationError(
        'Invalid limit value, must be a number between 1 and 10000 inclusive'
      )
    }
    return limit
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

const extractDatetime = function (params) {
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

const extractSortby = function (params) {
  let sortbyRules
  const { sortby } = params
  if (sortby) {
    if (typeof sortby === 'string') {
      // GET request - different syntax
      sortbyRules = []
      const sortbys = sortby.split(',')
      sortbys.forEach((sortbyRule) => {
        if (sortbyRule[0] === '-') {
          sortbyRules.push({ field: sortbyRule.slice(1), direction: 'desc' })
        } else if (sortbyRule[0] === '+') {
          sortbyRules.push({ field: sortbyRule.slice(1), direction: 'asc' })
        } else {
          sortbyRules.push({ field: sortbyRule, direction: 'asc' })
        }
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

const parsePath = function (inpath) {
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
const addCollectionLinks = function (results, endpoint) {
  results.forEach((result) => {
    const { id, links } = result
    // self link
    links.splice(0, 0, {
      rel: 'self',
      href: `${endpoint}/collections/${id}`
    })
    // parent catalog
    links.push({
      rel: 'parent',
      href: `${endpoint}/`
    })
    // root catalog
    links.push({
      rel: 'root',
      href: `${endpoint}/`
    })
    // child items
    links.push({
      rel: 'items',
      href: `${endpoint}/collections/${id}/items`
    })
  })
  return results
}

// Impure - mutates results
const addItemLinks = function (results, endpoint) {
  results.forEach((result) => {
    let { links } = result
    const { id, collection } = result

    links = (links === undefined) ? [] : links
    // self link
    links.splice(0, 0, {
      rel: 'self',
      href: `${endpoint}/collections/${collection}/items/${id}`
    })
    // parent catalogs
    links.push({
      rel: 'parent',
      href: `${endpoint}/collections/${collection}`
    })
    links.push({
      rel: 'collection',
      href: `${endpoint}/collections/${collection}`
    })
    // root catalog
    links.push({
      rel: 'root',
      href: `${endpoint}/`
    })
    result.type = 'Feature'
    return result
  })
  return results
}

const collectionsToCatalogLinks = function (results, endpoint) {
  const stacVersion = process.env.STAC_VERSION
  const catalogId = process.env.STAC_ID || 'stac-server'
  const catalogTitle = process.env.STAC_TITLE || 'A STAC API'
  const catalogDescription = process.env.STAC_DESCRIPTION || 'A STAC API running on stac-server'
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
      href: `${endpoint}/collections/${id}`
    }
  })
  return catalog
}

const wrapResponseInFeatureCollection = function (
  meta, features = [], links = []
) {
  return {
    type: 'FeatureCollection',
    stac_version: process.env.STAC_VERSION,
    stac_extensions: [],
    context: meta,
    numberMatched: meta.matched,
    numberReturned: meta.returned,
    features,
    links
  }
}

const buildPageLinks = function (meta, parameters, bbox, intersects, endpoint, httpMethod) {
  const pageLinks = []

  const dictToURI = (dict) => (
    Object.keys(dict).map(
      (p) => {
        // const query = encodeURIComponent(dict[p])
        let value = dict[p]
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value)
        }
        const query = encodeURIComponent(value)
        if (p === 'collections') {
          return `${encodeURIComponent(p)}[]=${query}`
        }
        return `${encodeURIComponent(p)}=${query}`
      }
    ).join('&')
  )
  const { matched, page, limit } = meta
  const linkParams = pickBy(assign(parameters, { bbox, intersects, limit }))

  if ((page * limit) < matched) {
    const newParams = { ...linkParams, page: page + 1 }
    const link = {
      rel: 'next',
      title: 'Next page of results',
      method: httpMethod
    }
    if (httpMethod === 'GET') {
      const nextQueryParameters = dictToURI(newParams)
      link.href = `${endpoint}?${nextQueryParameters}`
    } else if (httpMethod === 'POST') {
      link.href = endpoint
      link.merge = false
      link.body = newParams
    }
    pageLinks.push(link)
  }
  if (page > 1) {
    const newParams = { ...linkParams, page: page - 1 }
    const link = {
      rel: 'prev',
      title: 'Previous page of results',
      method: httpMethod
    }
    if (httpMethod === 'GET') {
      const prevQueryParameters = dictToURI(newParams)
      link.href = `${endpoint}?${prevQueryParameters}`
    } else if (httpMethod === 'POST') {
      link.href = endpoint
      link.merge = false
      link.body = newParams
    }
    pageLinks.push(link)
  }

  return pageLinks
}

const searchItems = async function (collectionId, queryParameters, backend, endpoint, httpMethod) {
  logger.debug(`Query parameters: ${JSON.stringify(queryParameters)}`)
  const {
    page,
    bbox,
    intersects
  } = queryParameters
  if (bbox && intersects) {
    throw new ValidationError('Expected bbox OR intersects, not both')
  }
  const datetime = extractDatetime(queryParameters)
  const bboxGeometry = extractBbox(queryParameters)
  const intersectsGeometry = extractIntersects(queryParameters)
  const geometry = intersectsGeometry || bboxGeometry

  const sortby = extractSortby(queryParameters)
  const query = extractStacQuery(queryParameters)
  const fields = extractFields(queryParameters)
  const ids = extractIds(queryParameters)
  const collections = extractCollectionIds(queryParameters)
  const limit = extractLimit(queryParameters)

  const searchParams = pickBy({
    datetime,
    intersects: geometry,
    query,
    sortby,
    fields,
    ids,
    collections,
    limit
  })

  let newEndpoint = `${endpoint}/search`
  if (collectionId) {
    searchParams.collections = [collectionId]
    newEndpoint = `${endpoint}/collections/${collectionId}/items`
  }

  logger.debug(`Search parameters: ${JSON.stringify(searchParams)}`)

  let results
  try {
    results = await backend.search(searchParams, page, limit)
  } catch (error) {
    if (isIndexNotFoundError(error)) {
      results = {
        context: {
          matched: 0,
          returned: 0,
          page,
          limit
        },
        results: []
      }
    } else {
      throw error
    }
  }

  const { results: itemsResults, context: itemsMeta } = results
  const pageLinks = buildPageLinks(
    itemsMeta, searchParams, bbox, intersects, newEndpoint, httpMethod
  )
  const items = addItemLinks(itemsResults, endpoint)
  const response = wrapResponseInFeatureCollection(itemsMeta, items, pageLinks)
  return response
}

const getConformance = async function (txnEnabled) {
  const prefix = 'https://api.stacspec.org/v1.0.0-beta.5'
  const conformsTo = [
    `${prefix}/core`,
    `${prefix}/collections`,
    `${prefix}/ogcapi-features`,
    `${prefix}/ogcapi-features#fields`,
    `${prefix}/ogcapi-features#sort`,
    `${prefix}/ogcapi-features#query`,
    `${prefix}/item-search`,
    `${prefix}/item-search#fields`,
    `${prefix}/item-search#sort`,
    `${prefix}/item-search#query`,
    'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core',
    'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/oas30',
    'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson'
  ]

  if (txnEnabled) {
    conformsTo.push(`${prefix}/ogcapi-features/extensions/transaction`)
  }

  return { conformsTo }
}

const getCatalog = async function (txnEnabled, backend, endpoint = '') {
  const links = [
    {
      rel: 'self',
      type: 'application/json',
      href: `${endpoint}/`
    },
    {
      rel: 'root',
      type: 'application/json',
      href: `${endpoint}/`
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
      href: `${endpoint}/search`
    },
    {
      rel: 'service-desc',
      type: 'application/vnd.oai.openapi',
      href: `${endpoint}/api`
    }
  ]

  const docsUrl = process.env.STAC_DOCS_URL
  if (docsUrl) {
    links.push({
      rel: 'docs',
      href: docsUrl,
      type: 'text/html'
    })
  }

  const collections = await backend.getCollections(1, COLLECTION_LIMIT)
  const catalog = collectionsToCatalogLinks(collections, endpoint)
  catalog.links = links.concat(catalog.links)
  catalog.conformsTo = (await getConformance(txnEnabled)).conformsTo

  return catalog
}

const getCollections = async function (backend, endpoint = '') {
  const results = await backend.getCollections(1, COLLECTION_LIMIT)
  const linkedCollections = addCollectionLinks(results, endpoint)

  // TODO: Attention, this is a SHIM. Implement proper pagination!
  const resp = {
    collections: results,
    links: [],
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
  const col = addCollectionLinks([result], endpoint)
  if (col.length > 0) {
    return col[0]
  }
  return new Error('Collection retrieval failed')
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
  logger.debug(`Partial Update Item: ${JSON.stringify(response)}`)
  if (response) {
    return addItemLinks([response.body.get._source], endpoint)[0]
  }
  return new Error(`Error partially updating item ${itemId}`)
}

const createItem = async function (item, backend) {
  const response = await backend.indexItem(item)
  logger.debug(`Create Item: ${JSON.stringify(response)}`)

  if (response) {
    return response
  }
  return new Error(`Error creating item in collection ${item.collection}`)
}

const updateItem = async function (item, backend) {
  const response = await backend.updateItem(item)
  logger.debug(`Update Item: ${JSON.stringify(response)}`)

  if (response) {
    return response
  }
  return new Error(`Error updating item ${item.id}`)
}

const deleteItem = async function (collectionId, itemId, backend) {
  const response = await backend.deleteItem(collectionId, itemId)
  logger.debug(`Delete Item: ${response}`)
  if (response) {
    return response
  }
  return new Error(`Error deleting item ${collectionId}/${itemId}`)
}

module.exports = {
  getConformance,
  getCatalog,
  getCollections,
  getCollection,
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
  extractDatetime
}
