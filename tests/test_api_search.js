const test = require('ava')
const sinon = require('sinon')
const proxquire = require('proxyquire')
const api = require('../libs/api')
const item = require('./fixtures/item.json')

function cloneMutatedItem() {
  return Object.assign({}, item, { links: item.links.slice(0) })
}

/*test('search es error', async (t) => {
  const error = sinon.spy()
  const proxyApi = proxquire('../libs/api', {
    console: {
      error
    }
  })
  const errorMessage = 'errorMessage'
  const search = sinon.stub().throws(new Error(errorMessage))
  const backend = { search }
  const response = await proxyApi.API('/', undefined, backend, 'endpoint')
  t.is(error.firstCall.args[0].message, errorMessage,
    'Logs Elasticsearch error via Winston transport')
  t.is(response.message, errorMessage)
  t.is(response.code, 500)
})*/

test('root /', async (t) => {
  const search = sinon.stub().resolves({ results: [], meta: {} })
  const getCollections = sinon.stub().resolves([])
  const backend = { search, getCollections }
  const actual = await api.API('/', undefined, backend, 'endpoint')
  t.is(actual.links.length, 6)
})

test('search /api', async (t) => {
  const actual = await api.API('/api', undefined, undefined, 'endpoint')
  t.truthy(actual.openapi)
})

test('search /conformance', async (t) => {
  const actual = await api.API('/conformance', undefined, undefined, 'endpoint')
  t.truthy(actual.conformsTo)
  t.is(actual.conformsTo.length, 8)
})

test('search /', async (t) => {
  process.env.STAC_DOCS_URL = 'test'
  const collection = 'collection'
  const results = { results: [{ id: collection }] }
  const search = sinon.stub().resolves(results)
  const getCollections = sinon.stub().resolves([])
  const backend = { search, getCollections }
  const actual = await api.API('/', undefined, backend, 'endpoint')
  const expectedLinks = [
    {
      rel: 'service-desc',
      type: 'application/vnd.oai.openapi+json;version=3.0',
      href: 'endpoint/api'
    },
    {
      rel: 'conformance',
      type: 'application/json',
      href: 'endpoint/conformance'
    },
    {
      rel: 'data',
      type: 'application/json',
      href: 'endpoint/collections'
    },
    {
      rel: 'self',
      type: 'application/json',
      href: 'endpoint/'
    },
    {
      rel: 'search',
      type: 'application/geo+json',
      href: 'endpoint/search'
    },
    {
      rel: 'docs',
      href: 'test'
    }
  ]
  t.is(getCollections.firstCall.args[0], 1)
  t.deepEqual(actual.links, expectedLinks,
    'Returns STAC catalog with links to collections')
})

// test('search /search wraps results', async (t) => {
//   const limit = 10
//   const meta = {
//     limit,
//     next: null,
//     matched: 1,
//     returned: 1
//   }
//   const clonedItem = cloneMutatedItem()
//   const results = [clonedItem]

//   const itemsResults = { 'search:metadata': meta, results }
//   const search = sinon.stub().resolves({ features: [], meta: {} })
//   search.resolves(itemsResults)
//   const backend = { search }
//   const actual = await api.API('/search', {}, backend, 'endpoint')
//   console.log('this is actual: ', actual)
//   t.deepEqual(actual.features[0].links, itemLinks.links,
//     'Adds correct relative STAC links')

//   const expectedMeta = {
//     limit,
//     next: null,
//     matched: 1,
//     returned: 1
//   }
//   t.deepEqual(actual['search:metadata'], expectedMeta, 'Adds correct response metadata fields')
//   t.is(actual.type, 'FeatureCollection', 'Wraps response as FeatureCollection')
// })

test('search /search query parameters', async (t) => {
  const search = sinon.stub().resolves({ results: [], meta: {} })
  const backend = { search }
  const query = { 'test': true }
  const queryParams = {
    page: 1,
    limit: 2,
    query
  }
  api.API('/search', queryParams, backend, 'endpoint')
  t.deepEqual(search.firstCall.args[0], { query },
    'Extracts query to use in search parameters')
})

test('search /search intersects parameter', async (t) => {
  const search = sinon.stub().resolves({ results: [], meta: {} })
  const backend = { search }
  const queryParams = {
    intersects: item.geometry,
    page: 1,
    limit: 1
  }
  api.API('/search', queryParams, backend, 'endpoint')
  t.deepEqual(search.firstCall.args[0].intersects, item.geometry,
    'Uses valid GeoJSON as intersects search parameter')

  search.resetHistory()
  queryParams.intersects = JSON.stringify(item.geometry)
  api.API('/search', queryParams, backend, 'endpoint')
  t.deepEqual(search.firstCall.args[0].intersects, item.geometry,
    'Handles stringified GeoJSON intersects parameter')
})

test('search /search bbox parameter', async (t) => {
  const search = sinon.stub().resolves({ results: [], meta: {} })
  const backend = { search }
  const w = -10
  const s = -10
  const e = 10
  const n = 10
  const bbox = [w, s, e, n]
  const queryParams = {
    bbox,
    page: 1,
    limit: 1
  }
  const expected = {
    type: 'Polygon',
    coordinates: [[
      [s, w],
      [n, w],
      [n, e],
      [s, e],
      [s, w]
    ]]
  }
  await api.API('/search', queryParams, backend, 'endpoint')
  t.deepEqual(search.firstCall.args[0].intersects, expected,
    'Converts a [w,s,e,n] bbox to an intersects search parameter')
  search.resetHistory()
  queryParams.bbox = `[${bbox.toString()}]`
  await api.API('/search', queryParams, backend, 'endpoint')
  t.deepEqual(search.firstCall.args[0].intersects, expected,
    'Converts stringified [w,s,e,n] bbox to an intersects search parameter')
})

test('search /search time parameter', async (t) => {
  const search = sinon.stub().resolves({ results: [], meta: {} })
  const backend = { search }
  const range = '2007-03-01T13:00:00Z/2008-05-11T15:30:00Z'
  const queryParams = {
    page: 1,
    limit: 2,
    datetime: range
  }
  await api.API('/search', queryParams, backend, 'endpoint')
  t.deepEqual(search.firstCall.args[0], { datetime: range },
    'Extracts time query parameter and transforms it into ' +
    'datetime search parameter')
})

test('search /collections', async (t) => {
  const getCollections = sinon.stub().resolves([{ id: 1, links: []}])
  const backend = { getCollections }
  const actual = await api.API('/collections', {}, backend, 'endpoint')
  t.is(getCollections.firstCall.args[1], 100)
  t.is(actual.collections.length, 1)
  t.is(actual.collections[0].links.length, 4, 'Adds STAC links to each collection')
})

test('search /collections/collectionId', async (t) => {
  const getCollection = sinon.stub().resolves({ id: 1, links: [] })
  const backend = { getCollection }
  const collectionId = 'collectionId'
  let actual = await api.API(
    `/collections/${collectionId}`, { test: 'test' }, backend, 'endpoint'
  )
  t.deepEqual(getCollection.firstCall.args[0], collectionId,
    'Calls search with the collectionId path element as id parameter' +
    ' and ignores other passed filter parameters')
  t.is(actual.links.length, 4, 'Returns the first found collection as object')

  getCollection.reset()
  getCollection.throws('err', 'Collection not found')
  actual = await api.API(
    `/collections/${collectionId}`, {}, backend, 'endpoint'
  )
  t.is(actual.message, 'Collection not found',
    'Sends error when not collections are found in search')
})

test('search /collections/collectionId/items', async (t) => {
  const meta = {
    limit: 1,
    page: 1,
    found: 1,
    returned: 1
  }

  const search = sinon.stub().resolves({
    meta,
    results: []
  })
  const backend = { search }
  const collectionId = 'collectionId'
  await api.API(
    `/collections/${collectionId}/items`, {}, backend, 'endpoint'
  )
  const expectedParameters = {
    collections: [collectionId]
  }
  t.deepEqual(search.firstCall.args[0], expectedParameters,
    'Calls search with the collectionId as a parameter')
})

test('search /collections/collectionId/items/itemId', async (t) => {
  const meta = {
    limit: 1,
    page: 1,
    found: 1,
    returned: 1
  }
  const clonedItem = cloneMutatedItem()
  const results = [clonedItem]
  const search = sinon.stub().resolves({
    meta,
    results
  })
  const backend = { search }
  const itemId = 'itemId'
  const actual = await api.API(
    `/collections/collectionId/items/${itemId}`, {}, backend, 'endpoint'
  )
  t.deepEqual(search.firstCall.args[0], { collections: ['collectionId'], id: itemId },
    'Calls search with the itemId path element as id parameter' +
    ' and ignores other passed filter parameters')

  t.is(actual.type, 'Feature')
  t.is(actual.links.length, 4, 'Adds STAC links to response object')
})
