const test = require('ava')
const { deleteAllIndices } = require('../helpers/es')
const { randomId } = require('../helpers/utils')
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
