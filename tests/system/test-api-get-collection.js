// @ts-nocheck

import test from 'ava'
import { deleteAllIndices } from '../helpers/database.js'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
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

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET /collections/:collectionId returns a collection', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.get(`collections/${collectionId}`,
    { resolveBodyOnly: false })

  t.is(response.statusCode, 200)
  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
  // @ts-expect-error We need to validate these responses
  t.is(response.body.id, collectionId)
})

test('GET /collection/:collectionId for non-existent collection returns Not Found', async (t) => {
  const response = await t.context.api.client.get(
    'collections/DOES_NOT_EXIST',
    { resolveBodyOnly: false, throwHttpErrors: false }
  )

  t.is(response.statusCode, 404)
})
