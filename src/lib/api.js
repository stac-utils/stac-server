const gjv = require('geojson-validation')
const extent = require('@mapbox/extent')
const { isIndexNotFoundError } = require('./es')
const logger = console

// max number of collections to retrieve
const COLLECTION_LIMIT = process.env.STAC_SERVER_COLLECTION_LIMIT || 100

const extractIntersects = function (params) {
  let intersectsGeometry
  const geojsonError = new Error('Invalid GeoJSON geometry')
  const geojsonFeatureError = new Error(
    'Expected GeoJSON geometry, not Feature or FeatureCollection'
  )
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
      geojson = { ...intersects }
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
      try {
        bboxArray = JSON.parse(bbox)
      } catch (e) {
        bboxArray = bbox.split(',').map(parseFloat)
      }
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
  let newParams
  let link
  if ((page * limit) < matched) {
    newParams = { ...parameters, page: page + 1, limit }
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
    newParams = { ...parameters, page: page - 1, limit }
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

  let newEndpoint = `${endpoint}/search`
  if (collectionId) {
    searchParameters.collections = [collectionId]
    newEndpoint = `${endpoint}/collections/${collectionId}/items`
  }
  logger.debug(`Search parameters: ${JSON.stringify(searchParameters)}`)

  let results
  try {
    results = await backend.search(searchParameters, page, limit)
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

  const { 'results': itemsResults, 'context': itemsMeta } = results
  const pageLinks = buildPageLinks(itemsMeta, searchParameters, newEndpoint, httpMethod)
  const items = addItemLinks(itemsResults, endpoint)
  const response = wrapResponseInFeatureCollection(itemsMeta, items, pageLinks)
  return response
}

const getConformance = async function () {
  const conformance = {
    conformsTo: [
      'https://api.stacspec.org/v1.0.0-beta.5/core',
      'https://api.stacspec.org/v1.0.0-beta.5/collections',
      'https://api.stacspec.org/v1.0.0-beta.5/ogcapi-features',
      'https://api.stacspec.org/v1.0.0-beta.5/ogcapi-features#fields',
      'https://api.stacspec.org/v1.0.0-beta.5/ogcapi-features#sort',
      'https://api.stacspec.org/v1.0.0-beta.5/ogcapi-features#query',
      'https://api.stacspec.org/v1.0.0-beta.5/item-search',
      'https://api.stacspec.org/v1.0.0-beta.5/item-search#fields',
      'https://api.stacspec.org/v1.0.0-beta.5/item-search#sort',
      'https://api.stacspec.org/v1.0.0-beta.5/item-search#query',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core',
      'http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/oas30',
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
  editPartialItem
}
