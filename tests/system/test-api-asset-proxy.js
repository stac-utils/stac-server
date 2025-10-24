// @ts-nocheck

import test from 'ava'
import { CreateBucketCommand } from '@aws-sdk/client-s3'
import { ALTERNATE_ASSETS_EXTENSION } from '../../src/lib/asset-proxy.js'
import { deleteAllIndices } from '../helpers/database.js'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
import { setup } from '../helpers/system-tests.js'
import setupAssetProxy from '../helpers/asset-proxy.js'
import { s3 } from '../../src/lib/aws-clients.js'

const COLLECTION_FIXTURE = 'landsat-8-l1-collection.json'
const ITEM_FIXTURE = 'stac/LC80100102015082LGN00.json'
const COLLECTION_WITH_ASSET_FIXTURE = 'stac/collection-with-asset.json'

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await setup()

  const s3Client = s3()
  await s3Client.send(new CreateBucketCommand({ Bucket: 'landsat-pds' }))

  standUpResult.api.app.locals['assetProxy'] = await setupAssetProxy('ALL_BUCKETS_IN_ACCOUNT')

  t.context = standUpResult

  t.context.collectionId = randomId('collection')
  const collection = await loadFixture(COLLECTION_FIXTURE, { id: t.context.collectionId })
  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: collection
  })

  t.context.itemId = randomId('item')
  const item = await loadFixture(ITEM_FIXTURE, {
    id: t.context.itemId,
    collection: t.context.collectionId
  })
  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item
  })

  t.context.collectionWithAssetId = randomId('collection-with-asset')
  const collectionWithAsset = await loadFixture(
    COLLECTION_WITH_ASSET_FIXTURE,
    { id: t.context.collectionWithAssetId }
  )
  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: collectionWithAsset
  })
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('AssetProxy initialized with ALL_BUCKETS_IN_ACCOUNT mode fetches buckets', (t) => {
  const assetProxy = t.context.api.app.locals['assetProxy']

  t.truthy(assetProxy.buckets)
  t.true(assetProxy.isEnabled)
  t.true(assetProxy.shouldProxyBucket('landsat-pds'))
  t.true(!assetProxy.shouldProxyBucket('some-other-bucket'))
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
  const { collectionWithAssetId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionWithAssetId}/assets/thumbnail`,
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

test('GET /collections/:collectionId/items/:itemId - item asset hrefs are transformed with proxy enabled', async (t) => {
  const { collectionId, itemId } = t.context

  const item = await loadFixture(ITEM_FIXTURE)

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`,
    { resolveBodyOnly: false }
  )

  t.is(response.statusCode, 200)
  const expectedAssetPath = `/collections/${collectionId}/items/${itemId}/assets/B1`
  t.true(response.body.assets.B1.href.includes(expectedAssetPath))
  t.is(response.body.assets.B1.alternate.s3.href, item.assets.B1.href)
  t.true(response.body.stac_extensions.includes(ALTERNATE_ASSETS_EXTENSION))
})

test('GET /collections/:collectionId - collection asset hrefs are transformed with proxy enabled', async (t) => {
  const { collectionWithAssetId } = t.context

  const collection = await loadFixture(COLLECTION_WITH_ASSET_FIXTURE)

  const response = await t.context.api.client.get(
    `collections/${collectionWithAssetId}`,
    { resolveBodyOnly: false }
  )

  t.is(response.statusCode, 200)
  const expectedAssetPath = `/collections/${collectionWithAssetId}/assets/thumbnail`
  t.true(response.body.assets.thumbnail.href.includes(expectedAssetPath))
  t.is(response.body.assets.thumbnail.alternate.s3.href, collection.assets.thumbnail.href)
  t.true(response.body.stac_extensions.includes(ALTERNATE_ASSETS_EXTENSION))
})
