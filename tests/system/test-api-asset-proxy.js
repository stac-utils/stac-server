// @ts-nocheck

/**
 * Asset Proxy System Tests
 *
 * These tests verify the asset proxy endpoints work correctly.
 * The env var is set before starting the API to test with proxying enabled.
 */

// Set env var before starting the API
process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

/* eslint-disable import/first */
import test from 'ava'
import { deleteAllIndices } from '../helpers/database.js'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
import { setup } from '../helpers/system-tests.js'
/* eslint-enable import/first */

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

  t.context.itemId = randomId('item')

  const item = await loadFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: t.context.itemId,
      collection: t.context.collectionId
    }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item
  })
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET /collections/:collectionId/items/:itemId/assets/:assetKey - 302 redirect to presigned URL', async (t) => {
  const { collectionId, itemId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}/assets/B1`,
    {
      resolveBodyOnly: false,
      throwHttpErrors: false,
      followRedirect: false
    }
  )

  t.is(response.statusCode, 302)
  t.truthy(response.headers.location)
  t.true(response.headers.location.includes('landsat-pds'))
  t.true(response.headers.location.includes('X-Amz-Algorithm'))
  t.true(response.headers.location.includes('X-Amz-Signature'))
})

test('GET /collections/:collectionId/assets/:assetKey - 302 redirect for collection assets', async (t) => {
  const { collectionId } = t.context

  const collection = await t.context.api.client.get(
    `collections/${collectionId}`,
    { resolveBodyOnly: false }
  )

  if (!collection.body.assets || Object.keys(collection.body.assets).length === 0) {
    t.pass('Collection has no assets to test')
    return
  }

  const assetKey = Object.keys(collection.body.assets)[0]

  const response = await t.context.api.client.get(
    `collections/${collectionId}/assets/${assetKey}`,
    {
      resolveBodyOnly: false,
      throwHttpErrors: false,
      followRedirect: false
    }
  )

  t.is(response.statusCode, 302)
  t.truthy(response.headers.location)
  t.true(response.headers.location.includes('X-Amz-Algorithm'))
})

test('GET /collections/:collectionId/items/:itemId/assets/:assetKey - 404 for non-existent asset', async (t) => {
  const { collectionId, itemId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}/assets/DOES_NOT_EXIST`,
    {
      resolveBodyOnly: false,
      throwHttpErrors: false
    }
  )

  t.is(response.statusCode, 404)
})

test('GET /collections/:collectionId/items/:itemId/assets/:assetKey - 404 for non-existent item', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items/DOES_NOT_EXIST/assets/B1`,
    {
      resolveBodyOnly: false,
      throwHttpErrors: false
    }
  )

  t.is(response.statusCode, 404)
})

test('GET /collections/:collectionId/items/:itemId/assets/:assetKey - 404 for non-existent collection', async (t) => {
  const response = await t.context.api.client.get(
    'collections/DOES_NOT_EXIST/items/DOES_NOT_EXIST/assets/B1',
    {
      resolveBodyOnly: false,
      throwHttpErrors: false
    }
  )

  t.is(response.statusCode, 404)
})
