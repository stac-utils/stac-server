const test = require('ava')
const { deleteAllIndices, refreshIndices } = require('../helpers/es')
const { randomId } = require('../helpers/utils')
const ingest = require('../../src/lib/ingest')
const stream = require('../../src/lib/esStream')
const systemTests = require('../helpers/system-tests')

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await systemTests.setup()

  t.context = standUpResult
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET /search returns an empty list of results for a collection that does not exist', async (t) => {
  const collectionId = randomId('collection')
  const searchParams = new URLSearchParams({ collections: [collectionId] })

  const response = await t.context.api.client.get('search', { searchParams })

  t.true(Array.isArray(response.features))
  t.is(response.features.length, 0)
})

test('GET /search has a content type of "application/geo+json; charset=utf-8', async (t) => {
  const response = await t.context.api.client.get('search', {
    resolveBodyOnly: false
  })

  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
})

test('/search preserve bbox in prev and next links', async (t) => {
  const fixtureFiles = [
    'catalog.json',
    'collection.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ]
  const items = await Promise.all(fixtureFiles.map((x) => systemTests.loadJson(x)))
  await ingest.ingestItems(items, stream)
  await refreshIndices()

  const bbox = '-180,-90,180,90'

  let response = await t.context.api.client.get('search', {

    searchParams: new URLSearchParams({
      bbox,
      limit: 2,
      page: 2
    }) })

  t.is(response.features.length, 0)
  t.is(response.links.length, 1)

  const prevLink = response.links.find((x) => x.rel === 'prev')
  t.deepEqual(new URL(prevLink.href).searchParams.get('bbox'), bbox)

  const datetime = '2015-02-19T00:00:00Z/2021-02-19T00:00:00Z'
  response = await t.context.api.client.get('search', {
    searchParams: new URLSearchParams({
      bbox,
      datetime: datetime,
      limit: 1
    })
  })

  t.is(response.features.length, 1)
  t.is(response.links.length, 1)

  const nextLink = response.links.find((x) => x.rel === 'next')
  const nextUrl = new URL(nextLink.href)
  t.deepEqual(nextUrl.searchParams.get('bbox'), bbox)
  t.deepEqual(nextUrl.searchParams.get('datetime'), datetime)
})
