// @ts-nocheck

import test from 'ava'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
import { refreshIndices, deleteAllIndices } from '../helpers/database.js'
import { setup } from '../helpers/system-tests.js'

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await setup()

  t.context = standUpResult

  t.context.collectionId = randomId('collection')

  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: t.context.collectionId }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: collection
  })
})

test('GET /collections', async (t) => {
  await refreshIndices()

  const response = await t.context.api.client.get('collections')

  t.true(Array.isArray(response.collections))
  t.true(response.collections.length > 0)

  t.falsy(response.context)

  // queryables definition is stored in the collection document in OpenSearch,
  // but we do not want it in the Collection entity returned from the API or
  // people will start using this (non-standard) field
  for (const c of response.collections) {
    t.falsy(c.queryables)
  }
})

test('GET /collections has a content type of "application/json', async (t) => {
  const response = await t.context.api.client.get('collections', { resolveBodyOnly: false })

  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
})

test('GET /collections with restriction returns filtered collections', async (t) => {
  process.env['ENABLE_COLLECTIONS_AUTHX'] = 'true'

  await refreshIndices()

  const { collectionId } = t.context

  // disable collections filtering
  process.env['ENABLE_COLLECTIONS_AUTHX'] = 'not true'

  t.is((await t.context.api.client.get(
    'collections', {
      searchParams: { _collections: 'not-a-collection' } }
  )
  ).collections.length, 1)

  // enable collections filtering

  process.env['ENABLE_COLLECTIONS_AUTHX'] = 'true'

  t.is((await t.context.api.client.get(
    'collections', {
      searchParams: { _collections: `${collectionId},foo,bar` } }
  )
  ).collections.length, 1)

  t.is((await t.context.api.client.get(
    'collections', {
      searchParams: { _collections: 'not-a-collection' } }
  )
  ).collections.length, 0)
})
