import test from 'ava'
import type { ExecutionContext } from 'ava'
import { ALTERNATE_ASSETS_EXTENSION } from '../../src/lib/asset-proxy.js'
import { deleteAllIndices } from '../helpers/database.js'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
import { setup } from '../helpers/system-tests.js'
import type { StandUpResult } from '../helpers/system-tests.js'
import setupAssetProxy from '../helpers/asset-proxy.js'

const COLLECTION_FIXTURE = 'landsat-8-l1-collection.json'
const ITEM_FIXTURE = 'stac/LC80100102015082LGN00.json'
const COLLECTION_WITH_ASSET_FIXTURE = 'stac/collection-with-asset.json'

type TestContext = StandUpResult & {
  collectionId: string
  itemId: string
  collectionWithAssetId: string
}

test.before(async (t: ExecutionContext<TestContext>) => {
  await deleteAllIndices()
  const standUpResult = await setup()

  standUpResult.api.app.locals['assetProxy'] = await setupAssetProxy('NONE')

  t.context = standUpResult as TestContext

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

test.after.always(async (t: ExecutionContext<TestContext>) => {
  if (t.context.api) await t.context.api.close()
})

test(
  'GET /collections/:collectionId/items/:itemId/assets/:assetKey - returns 404 when proxy disabled',
  async (t: ExecutionContext<TestContext>) => {
    const { collectionId, itemId } = t.context

    const response = await t.context.api.client.get(
      `collections/${collectionId}/items/${itemId}/assets/B1`,
      {
        resolveBodyOnly: false,
        throwHttpErrors: false,
        followRedirect: false
      }
    )

    t.is(response.statusCode, 404)
  }
)

test(
  'GET /collections/:collectionId/assets/:assetKey - returns 404 when proxy disabled',
  async (t: ExecutionContext<TestContext>) => {
    const { collectionWithAssetId } = t.context

    const response = await t.context.api.client.get(
      `collections/${collectionWithAssetId}/assets/thumbnail`,
      {
        resolveBodyOnly: false,
        throwHttpErrors: false,
        followRedirect: false
      }
    )

    t.is(response.statusCode, 404)
  }
)

test(
  'GET /collections/:collectionId/items/:itemId - item asset hrefs unchanged when proxy disabled',
  async (t: ExecutionContext<TestContext>) => {
    const { collectionId, itemId } = t.context

    const item = await loadFixture(ITEM_FIXTURE)

    const response = await t.context.api.client.get(
      `collections/${collectionId}/items/${itemId}`,
      { resolveBodyOnly: false }
    )

    t.is(response.statusCode, 200)
    // @ts-expect-error We need to validate these responses
    t.is(response.body.assets.B1.href, item['assets']['B1']['href'])
    // @ts-expect-error We need to validate these responses
    t.falsy(response.body.assets.B1.alternate)
    // @ts-expect-error We need to validate these responses
    t.false(response.body.stac_extensions?.includes(ALTERNATE_ASSETS_EXTENSION))
  }
)

test(
  'GET /collections/:collectionId - collection asset hrefs unchanged when proxy disabled',
  async (t: ExecutionContext<TestContext>) => {
    const { collectionWithAssetId } = t.context

    const collection = await loadFixture(COLLECTION_WITH_ASSET_FIXTURE)

    const response = await t.context.api.client.get(
      `collections/${collectionWithAssetId}`,
      { resolveBodyOnly: false }
    )

    t.is(response.statusCode, 200)
    // @ts-expect-error We need to validate these responses
    t.is(response.body.assets.thumbnail.href, collection['assets']['thumbnail']['href'])
    // @ts-expect-error We need to validate these responses
    t.falsy(response.body.assets.thumbnail.alternate)
    // @ts-expect-error We need to validate these responses
    t.false(response.body.stac_extensions?.includes(ALTERNATE_ASSETS_EXTENSION))
  }
)

test(
  'POST /search - item asset hrefs unchanged when proxy disabled',
  async (t: ExecutionContext<TestContext>) => {
    const item = await loadFixture(ITEM_FIXTURE)

    const response = await t.context.api.client.post('search', {
      json: {
        limit: 1,
        fields: { include: ['assets', 'stac_extensions'] }
      }
    })

    // @ts-expect-error We need to validate these responses
    t.is(response.type, 'FeatureCollection')
    // @ts-expect-error We need to validate these responses
    t.true(response.features.length > 0)
    // @ts-expect-error We need to validate these responses
    t.is(response.features[0].assets.B1.href, item['assets']['B1']['href'])
    // @ts-expect-error We need to validate these responses
    t.falsy(response.features[0].assets.B1.alternate)
    // @ts-expect-error We need to validate these responses
    t.false(response.features[0].stac_extensions?.includes(ALTERNATE_ASSETS_EXTENSION))
  }
)

test(
  'GET /collections - collection asset hrefs unchanged when proxy disabled',
  async (t: ExecutionContext<TestContext>) => {
    const { collectionWithAssetId } = t.context

    const collection = await loadFixture(COLLECTION_WITH_ASSET_FIXTURE)

    const response = await t.context.api.client.get('collections', {
      resolveBodyOnly: false
    })

    t.is(response.statusCode, 200)

    // @ts-expect-error We need to validate these responses
    const collectionWithAssets = response.body.collections.find(
      // @ts-expect-error We need to validate these responses
      (c) => c.id === collectionWithAssetId
    )

    t.truthy(collectionWithAssets)
    t.is(collectionWithAssets.assets.thumbnail.href, collection['assets']['thumbnail']['href'])
    t.falsy(collectionWithAssets.assets.thumbnail.alternate)
  }
)

test(
  'GET /collections/:collectionId/items - item asset hrefs unchanged when proxy disabled',
  async (t: ExecutionContext<TestContext>) => {
    const { collectionId } = t.context

    const item = await loadFixture(ITEM_FIXTURE)

    const response = await t.context.api.client.get(
      `collections/${collectionId}/items`,
      { resolveBodyOnly: false }
    )

    t.is(response.statusCode, 200)
    // @ts-expect-error We need to validate these responses
    t.is(response.body.type, 'FeatureCollection')
    // @ts-expect-error We need to validate these responses
    t.true(response.body.features.length > 0)
    // @ts-expect-error We need to validate these responses
    t.is(response.body.features[0].assets.B1.href, item['assets']['B1']['href'])
    // @ts-expect-error We need to validate these responses
    t.falsy(response.body.features[0].assets.B1.alternate)
  }
)
