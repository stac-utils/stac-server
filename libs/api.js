const gjv = require('geojson-validation')
const extent = require('@mapbox/extent')
const yaml = require('js-yaml')
const fs = require('fs')
const logger = console
const path = require('path')
const httpMethods = require('../utils/http-methods')

// max number of collections to retrieve
const COLLECTION_LIMIT = process.env.STAC_SERVER_COLLECTION_LIMIT || 100


const extractIntersects = function (params) {
  let intersectsGeometry
  const geojsonError = new Error('Invalid GeoJSON geometry')
  const geojsonFeatureError =
        new Error('Expected GeoJSON geometry, not Feature or FeatureCollection')
  const { intersects } = params
  if (intersects) {
    let geojson
    // if we receive a string, try to parse as GeoJSON, otherwise assume it is GeoJSON
    if (typeof intersects === 'string') {
      try {
        geojson = JSON.parse(intersects)
      } catch (e) {
        throw geojsonError
      }
    } else {
      geojson = Object.assign({}, intersects)
    }

    if (gjv.valid(geojson)) {
      if (geojson.type === 'FeatureCollection') {
        throw geojsonFeatureError
      } else if (geojson.type === 'Feature') {
        throw geojsonFeatureError
      }
      intersectsGeometry = geojson
    } else {
      throw geojsonError
    }
  }
  return intersectsGeometry
}

const extractBbox = function (params) {
  let intersectsGeometry
  const { bbox } = params
  if (bbox) {
    let bboxArray
    if (typeof bbox === 'string') {
      bboxArray = JSON.parse(bbox)
    } else {
      bboxArray = bbox
    }
    const boundingBox = extent(bboxArray)
    intersectsGeometry = boundingBox.polygon()
  }
  return intersectsGeometry
}


const extractStacQuery = function (params) {
  let stacQuery
  const { query } = params
  if (query) {
    if (typeof query === 'string') {
      const parsed = JSON.parse(query)
      stacQuery = parsed
    } else {
      stacQuery = Object.assign({}, query)
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
          sortbyRules.push({ 'field': sortbyRule.slice(1), 'direction': 'desc' })
        } else if (sortbyRule[0] === '+') {
          sortbyRules.push({ 'field': sortbyRule.slice(1), 'direction': 'asc' })
        } else {
          sortbyRules.push({ 'field': sortbyRule, 'direction': 'asc' })
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
      idsRules = JSON.parse(ids)
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
      idsRules = JSON.parse(collections)
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

  searchFilters.collectionId =
    pathComponents[0] === collections && length >= 2 ? pathComponents[1] : false
  searchFilters.search = pathComponents[0] === search
  searchFilters.items = pathComponents[2] === items
  searchFilters.itemId =
    pathComponents[2] === items && length >= 4 ? pathComponents[3] : false
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
  const stac_version = process.env.STAC_VERSION
  const stac_api_version = process.env.STAC_API_VERSION
  const stac_id = process.env.STAC_ID || 'stac-server'
  const stac_title = process.env.STAC_TITLE || 'A STAC API'
  const stac_description = process.env.STAC_DESCRIPTION || 'A STAC API running on stac-server'
  const catalog = {
    stac_version,
    stac_api_version,
    id: stac_id,
    title: stac_title,
    description: stac_description
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
    'stac_version': process.env.STAC_VERSION,
    'stac_extensions': [],
    'context': meta,
    'numberMatched': meta.matched,
    'numberReturned': meta.returned,
    features,
    links
  }
}

const buildPageLinks = function (meta, parameters, endpoint, httpMethod) {
  const pageLinks = []

  const dictToURI = (dict) => (
    Object.keys(dict).map(
      (p) => {
        //TODO: how did this work without JSON.stringify?
        // const query = encodeURIComponent(dict[p])
        let value = dict[p]
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value)
        }
        const query = encodeURIComponent(value)
        if (p === 'collections') {
          return `${encodeURIComponent(p)}[]=${query}`
        } else {
          return `${encodeURIComponent(p)}=${query}`
        }
    }).join('&')
  )
  const { matched, page, limit } = meta
  let newParams
  let link
  if ((page * limit) < matched) {
    newParams = Object.assign({}, parameters, { page: page + 1, limit })
    link = {
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
    newParams = Object.assign({}, parameters, { page: page - 1, limit })
    link = {
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
    limit,
    page,
    datetime
  } = queryParameters
  const bbox = extractBbox(queryParameters)
  const hasIntersects = extractIntersects(queryParameters)
  // TODO: Figure out, why is this not allowed?
  // if (bbox && hasIntersects) {
  //   throw new Error('Expected bbox OR intersects, not both')
  // }
  const sortby = extractSortby(queryParameters)
  // Prefer intersects
  const intersects = hasIntersects || bbox
  const query = extractStacQuery(queryParameters)
  const fields = extractFields(queryParameters)
  const ids = extractIds(queryParameters)
  const collections = extractCollectionIds(queryParameters)

  const parameters = {
    datetime,
    intersects,
    query,
    sortby,
    fields,
    ids,
    collections
  }

  // Keep only existing parameters
  const searchParameters = Object.keys(parameters)
    .filter((key) => parameters[key])
    .reduce((obj, key) => ({
      ...obj,
      [key]: parameters[key]
    }), {})

  let new_endpoint = `${endpoint}/search`
  if (collectionId) {
    searchParameters.collections = [collectionId]
    new_endpoint = `${endpoint}/collections/${collectionId}/items`
  }
  logger.debug(`Search parameters: ${JSON.stringify(searchParameters)}`)
  const results = await backend.search(searchParameters, page, limit)
  const { 'results': itemsResults, 'context': itemsMeta } = results
  const pageLinks = buildPageLinks(itemsMeta, searchParameters, new_endpoint, httpMethod)
  const items = addItemLinks(itemsResults, endpoint)
  const response = wrapResponseInFeatureCollection(itemsMeta, items, pageLinks)
  return response
}


const getAPI = async function () {
  const spec = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, './api.yaml'), 'utf8'))
  return spec
}


const getConformance = async function () {
  const conformance = {
    conformsTo: [
      'https://api.stacspec.org/v1.0.0/core',
      'https://api.stacspec.org/v1.0.0/item-search',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/html',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson'
    ]
  }
  return conformance
}


const getCatalog = async function (backend, endpoint = '') {
  const collections = await backend.getCollections(1, COLLECTION_LIMIT)
  let catalog = collectionsToCatalogLinks(collections, endpoint)
  catalog.links.push({
    rel: 'service-desc',
    type: 'application/vnd.oai.openapi+json;version=3.0',
    href: `${endpoint}/api`
  })
  catalog.links.push({
    rel: 'conformance',
    type: 'application/json',
    href: `${endpoint}/conformance`
  })
  catalog.links.push({
    rel: 'data',
    type: 'application/json',
    href: `${endpoint}/collections`
  })
  catalog.links.push({
    rel: 'self',
    type: 'application/json',
    href: `${endpoint}/`
  })
  catalog.links.push({
    rel: 'search',
    type: 'application/geo+json',
    href: `${endpoint}/search`
  })
  const docsUrl = process.env.STAC_DOCS_URL || 'https://stac-utils.github.io/stac-api'
  if (docsUrl) {
    catalog.links.push({
      rel: 'docs',
      href: process.env.STAC_DOCS_URL
    })
  }
  catalog = Object.assign(catalog, await getConformance())
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
  const col = addCollectionLinks([result], endpoint)
  if (col.length > 0) {
    return col[0]
  }
  return new Error('Collection not found')
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


const editPartialItem = async function (itemId, queryParameters, backend, endpoint = '') {
  const response = await backend.editPartialItem(itemId, queryParameters)
  logger.debug(`Edit Item: ${response}`)
  if (response) {
    return addItemLinks([response.get._source], endpoint)[0]
  }
  return new Error(`Error editing item ${itemId}`)
}


const API = async function (
  inpath = '', queryParameters = {}, backend, endpoint = '', httpMethod = 'GET'
) {
  logger.debug(`API Path: ${inpath}, Query Parameters: ${JSON.stringify(queryParameters)}`)
  let apiResponse
  try {
    if (httpMethod === 'GET') {
      // Lets attempt to HTML entity decode values if they have been passed from GET
      Object.keys(queryParameters).forEach((key) => {
        if (queryParameters[key][0] === '%') {
          queryParameters[key] = decodeURIComponent(queryParameters[key])
        }
      })
    }

    const pathElements = parsePath(inpath)

    const {
      root,
      api,
      conformance,
      search: searchPath,
      collections,
      collectionId,
      items,
      itemId
    } = pathElements

    // API Root
    if (root) {
      apiResponse = await getCatalog(backend, endpoint)
    }
    // API Definition
    if (api) {
      apiResponse = await getAPI()
    }
    // Conformance
    if (conformance) {
      apiResponse = await getConformance()
    }
    // STAC Search
    if (searchPath) {
      apiResponse = await searchItems(
        null, queryParameters, backend, endpoint, httpMethod
      )
    }
    // Search

    // All collections
    if (collections && !collectionId) {
      apiResponse = await getCollections(backend, endpoint)
    }
    // Specific collection
    if (collections && collectionId && !items) {
      apiResponse = await getCollection(collectionId, backend, endpoint)
    }
    // Items in a collection
    if (collections && collectionId && items && !itemId) {
      apiResponse = await searchItems(collectionId, queryParameters, backend, endpoint, httpMethod)
    }

    // Specific item
    const pathIsToSpecificItem = (collections && collectionId && items && itemId)

    if (pathIsToSpecificItem) {
      if (httpMethod === httpMethods.GET) {
        apiResponse = await getItem(collectionId, itemId, backend, endpoint)
      } else if (httpMethod === httpMethods.PATCH && process.env.ENABLE_TRANSACTIONS_EXTENSION) {
        // Right now this is the only Transaction extension we support.
        // https://github.com/radiantearth/stac-api-spec/tree/master/extensions/transaction
        // When we do more, let's make a more scalable check and not look
        // for ENABLE_TRANSACTIONS_EXTENSION each time
        apiResponse = await editPartialItem(itemId, queryParameters, backend, endpoint)
      }
    }
  } catch (error) {
    logger.error(error)
    apiResponse = new Error(error.message)
  }
  return apiResponse
}

module.exports = {
  getAPI,
  getConformance,
  getCatalog,
  getCollections,
  getCollection,
  getItem,
  searchItems,
  API,
  parsePath,
  extractIntersects
}
