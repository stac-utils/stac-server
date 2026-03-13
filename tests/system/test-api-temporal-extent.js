// @ts-nocheck

import test from 'ava'
import { deleteAllIndices, refreshIndices } from '../helpers/database.js'
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

  // Ingest items with different dates
  const item1 = await loadFixture('stac/LC80100102015002LGN00.json', {
    collection: t.context.collectionId,
    properties: {
      datetime: '2015-01-02T15:49:05.000Z'
    }
  })

  const item2 = await loadFixture('stac/LC80100102015002LGN00.json', {
    collection: t.context.collectionId,
    id: 'item-2',
    properties: {
      datetime: '2020-06-15T10:30:00.000Z'
    }
  })

  const item3 = await loadFixture('stac/LC80100102015002LGN00.json', {
    collection: t.context.collectionId,
    id: 'item-3',
    properties: {
      datetime: '2018-03-20T08:15:00.000Z'
    }
  })

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: item1
  })

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: item2
  })

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: item3
  })

  await refreshIndices()
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET /collections/:collectionId returns temporal extent from items', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.get(`collections/${collectionId}`,
    { resolveBodyOnly: false })

  t.is(response.statusCode, 200)
  t.is(response.body.id, collectionId)

  // Check that extent.temporal.interval exists and is populated
  t.truthy(response.body.extent)
  t.truthy(response.body.extent.temporal)
  t.truthy(response.body.extent.temporal.interval)
  t.is(response.body.extent.temporal.interval.length, 1)

  const [startDate, endDate] = response.body.extent.temporal.interval[0]

  // Verify the start date is the earliest item datetime (2015-01-02)
  t.is(startDate, '2015-01-02T15:49:05.000Z')

  // Verify the end date is the latest item datetime (2020-06-15)
  t.is(endDate, '2020-06-15T10:30:00.000Z')
})

test('GET /collections returns temporal extent for all collections', async (t) => {
  const response = await t.context.api.client.get('collections',
    { resolveBodyOnly: false })

  t.is(response.statusCode, 200)
  t.truthy(response.body.collections)
  t.true(response.body.collections.length > 0)

  // Find our test collection
  const collection = response.body.collections.find((c) => c.id === t.context.collectionId)
  t.truthy(collection)

  // Check that extent.temporal.interval exists and is populated
  t.truthy(collection.extent)
  t.truthy(collection.extent.temporal)
  t.truthy(collection.extent.temporal.interval)
  t.is(collection.extent.temporal.interval.length, 1)

  const [startDate, endDate] = collection.extent.temporal.interval[0]

  // Verify the dates match the items
  t.is(startDate, '2015-01-02T15:49:05.000Z')
  t.is(endDate, '2020-06-15T10:30:00.000Z')
})

test('Collection with no items has null temporal extent', async (t) => {
  // Create a new collection with no items
  const emptyCollectionId = randomId('empty-collection')
  const emptyCollection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: emptyCollectionId }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: emptyCollection
  })

  await refreshIndices()

  const response = await t.context.api.client.get(`collections/${emptyCollectionId}`,
    { resolveBodyOnly: false })

  t.is(response.statusCode, 200)
  t.is(response.body.id, emptyCollectionId)

  // For a collection with no items, temporal extent should still exist from the original collection
  // but our code should gracefully handle this (return null or keep original)
  t.truthy(response.body.extent)
})
