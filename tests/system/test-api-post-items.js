// @ts-check

const { default: anyTest } = require('ava')
const { apiClient } = require('../helpers/api-client')
const { deleteAllIndices } = require('../helpers/es')
const { ingestItem } = require('../helpers/ingest')
const { randomId, loadFixture } = require('../helpers/utils')
const intersectsGeometry = require('../fixtures/stac/intersectsGeometry.json')
const noIntersectsGeometry = require('../fixtures/stac/noIntersectsGeometry.json')
const systemTests = require('../helpers/system-tests')

/**
 * @template T
 * @typedef {import('ava').TestFn<T>} TestFn<T>
 */

/**
 * @typedef {import('../helpers/types').SystemTestContext} SystemTestContext
 */

/**
 * @typedef {Object} TestContext
 * @property {string} collectionId
 * @property {string} itemId1
 * @property {string} itemId2
 */

const test = /** @type {TestFn<TestContext & SystemTestContext>} */ (anyTest)

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await systemTests.setup()

  t.context.ingestQueueUrl = standUpResult.ingestQueueUrl
  t.context.ingestTopicArn = standUpResult.ingestTopicArn

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

  t.context.itemId1 = randomId('item')

  const item1 = await loadFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: t.context.itemId1,
      collection: t.context.collectionId
    }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: item1
  })

  t.context.itemId2 = randomId('item')

  const item2 = await loadFixture(
    'stac/LC80100102015050LGN00.json',
    {
      id: t.context.itemId2,
      collection: t.context.collectionId
    }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: item2
  })
})

test('POST /collections/:collectionId/items with bbox 1', async (t) => {
  const { collectionId, itemId1, itemId2 } = t.context

  const response = await apiClient.post(`collections/${collectionId}/items`, {
    json: {
      bbox: [-180, -90, 180, 90]
    }
  })
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, itemId1)
  t.is(response.features[1].id, itemId2)
})

test('POST /collections/:collectionId/items with bbox 2', async (t) => {
  const { collectionId } = t.context

  const response = await apiClient.post(`collections/${collectionId}/items`, {
    json: {
      bbox: [-5, -5, 5, 5]
    }
  })

  t.is(response.features.length, 0)
})

test('/collections/:collectionId/items with bbox and intersects', async (t) => {
  const { collectionId } = t.context

  const response = await apiClient.post(`collections/${collectionId}/items`, {
    json: {
      bbox: [-180, -90, 180, 90],
      intersects: intersectsGeometry
    }
  })

  t.truthy(response.context.matched === 2)
})

test('/collections/:collectionId/items with time', async (t) => {
  const { collectionId, itemId2 } = t.context

  let response = await apiClient.post(`collections/${collectionId}/items`, {
    json: {
      datetime: '2015-02-19T15:06:12.565047+00:00'
    }
  })
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, itemId2)

  response = await apiClient.post(`collections/${collectionId}/items`, {
    json: {
      datetime: '2015-02-17/2015-02-20'
    }
  })
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, itemId2)

  response = await apiClient.post(`collections/${collectionId}/items`, {
    json: {
      datetime: '2015-02-19/2015-02-20'
    }
  })
  t.is(
    response.features[0].id,
    itemId2,
    'Handles date range without times inclusion issue'
  )
})

test('/collections/:collectionId/items with limit', async (t) => {
  const { collectionId } = t.context

  const response = await apiClient.post(`collections/${collectionId}/items`, {
    json: {
      limit: 1
    }
  })
  t.is(response.type, 'FeatureCollection')
  t.is(response.features.length, 1)
})

test('/collections/:collectionId/items with intersects', async (t) => {
  const { collectionId, itemId1, itemId2 } = t.context

  let response = await apiClient.post(`collections/${collectionId}/items`, {
    json: {
      intersects: intersectsGeometry
    }
  })
  t.is(response.type, 'FeatureCollection')
  t.is(response.features[0].id, itemId1)
  t.is(response.features[1].id, itemId2)

  response = await apiClient.post(`collections/${collectionId}/items`, {
    json: {
      intersects: noIntersectsGeometry
    }
  })
  t.is(response.features.length, 0)
})

test('/collections/:collectionId/items with eq query', async (t) => {
  const { collectionId, itemId2 } = t.context

  const response = await apiClient.post(`collections/${collectionId}/items`, {
    json: {
      query: {
        'eo:cloud_cover': {
          eq: 0.54
        }
      }
    }
  })
  t.is(response.features.length, 1)
  t.is(response.features[0].id, itemId2)
})

test('/collections/:collectionId/items with gt lt query', async (t) => {
  const { collectionId, itemId2 } = t.context

  const response = await apiClient.post(`collections/${collectionId}/items`, {
    json: {
      query: {
        'eo:cloud_cover': {
          gt: 0.5,
          lt: 0.6
        }
      }
    }
  })
  t.is(response.features.length, 1)
  t.is(response.features[0].id, itemId2)
})
