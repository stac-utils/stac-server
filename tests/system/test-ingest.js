import test from 'ava'
import nock from 'nock'
import { DateTime } from 'luxon'
import { getCollectionIds, getItem } from '../helpers/api.js'
import handler from '../../src/lambdas/ingest/index.js'
import { loadFixture, randomId } from '../helpers/utils.js'
import { refreshIndices, deleteAllIndices } from '../helpers/database.js'
import { sqsTriggerLambda, purgeQueue } from '../helpers/sqs.js'
import { sns, s3 as _s3 } from '../../src/lib/aws-clients.js'
import { setup } from '../helpers/system-tests.js'
import { ingestItemC, ingestFixtureC } from '../helpers/ingest.js'

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await setup()

  t.context = standUpResult

  t.context.ingestItem = ingestItemC(
    standUpResult.ingestTopicArn,
    standUpResult.ingestQueueUrl
  )
  t.context.ingestFixture = ingestFixtureC(
    standUpResult.ingestTopicArn,
    standUpResult.ingestQueueUrl
  )
})

test.beforeEach(async (t) => {
  const { ingestQueueUrl } = t.context

  if (ingestQueueUrl === undefined) throw new Error('No ingest queue url')

  await purgeQueue(ingestQueueUrl)
})

test.afterEach.always(() => {
  nock.cleanAll()
})

test('The ingest lambda supports ingesting a collection published to SNS', async (t) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

  if (ingestTopicArn === undefined) throw new Error('No ingest topic ARN')

  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  await sns().publish({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify(collection)
  }).promise()

  await sqsTriggerLambda(ingestQueueUrl, handler)

  await refreshIndices()

  const collectionIds = await getCollectionIds(t.context.api.client)

  t.true(collectionIds.includes(collection.id))
})

test('The ingest lambda supports ingesting a collection sourced from S3', async (t) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

  if (ingestTopicArn === undefined) throw new Error('No ingest topic ARN')

  const s3 = _s3()

  // Load the collection to be ingested
  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  // Create the S3 bucket to source the collection from
  const sourceBucket = randomId('bucket')
  const sourceKey = randomId('key')

  await s3.createBucket({
    Bucket: sourceBucket
  }).promise()

  await s3.putObject({
    Bucket: sourceBucket,
    Key: sourceKey,
    Body: JSON.stringify(collection)
  }).promise()

  await sns().publish({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify({ href: `s3://${sourceBucket}/${sourceKey}` })
  }).promise()

  await sqsTriggerLambda(ingestQueueUrl, handler)

  await refreshIndices()

  const collectionIds = await getCollectionIds(t.context.api.client)

  t.true(collectionIds.includes(collection.id))
})

test('The ingest lambda supports ingesting a collection sourced from http', async (t) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

  if (ingestTopicArn === undefined) throw new Error('No ingest topic ARN')

  // Load the collection to be ingested
  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  nock('http://source.local').get('/my-file.dat').reply(200, collection)

  await sns().publish({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify({ href: 'http://source.local/my-file.dat' })
  }).promise()

  await sqsTriggerLambda(ingestQueueUrl, handler)

  await refreshIndices()

  const collectionIds = await getCollectionIds(t.context.api.client)

  t.true(collectionIds.includes(collection.id))
})

test('Reingesting an item maintains the `created` value and updates `updated`', async (t) => {
  const { ingestFixture, ingestItem } = t.context

  const collection = await ingestFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  const item = await ingestFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: randomId('item'),
      collection: collection.id
    }
  )

  const originalItem = await getItem(t.context.api.client, collection.id, item.id)
  const originalCreated = DateTime.fromISO(originalItem.properties.created)
  const originalUpdated = DateTime.fromISO(originalItem.properties.updated)

  await ingestItem(item)

  const updatedItem = await getItem(t.context.api.client, collection.id, item.id)
  const updatedCreated = DateTime.fromISO(updatedItem.properties.created)
  const updatedUpdated = DateTime.fromISO(updatedItem.properties.updated)

  t.is(updatedCreated.toISO(), originalCreated.toISO())
  t.true(updatedUpdated.toISO() > originalUpdated.toISO())
})

test('Reingesting an item removes extra fields', async (t) => {
  const { ingestFixture, ingestItem } = t.context

  const collection = await ingestFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  const { properties, ...item } = await loadFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: randomId('item'),
      collection: collection.id
    }
  )

  const originalItem = {
    ...item,
    properties: {
      ...properties,
      extra: 'hello'
    }
  }

  await ingestItem(originalItem)

  const originalFetchedItem = await getItem(t.context.api.client, collection.id, item.id)

  t.is(originalFetchedItem.properties.extra, 'hello')

  // The new item is the same as the old, except that it does not have properties.extra
  const updatedItem = {
    ...item,
    properties
  }

  await ingestItem(updatedItem)

  const updatedFetchedItem = await getItem(t.context.api.client, collection.id, item.id)

  t.false('extra' in updatedFetchedItem.properties)
})

const assertHasResultCountC = (t) => async (count, searchBody, message) => {
  const response = await t.context.api.client.post('search', { json: searchBody })
  t.true(Array.isArray(response.features), message)
  t.is(response.features.length, count, message)
}

test('Mappings are correctly configured for non-default detected fields', async (t) => {
  const { ingestFixture } = t.context

  const collection = await ingestFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  await ingestFixture(
    'stac/mapping-item1.json',
    {
      id: randomId('item'),
      collection: collection.id
    }
  )

  const ingestedItem2 = await ingestFixture(
    'stac/mapping-item2.json',
    {
      id: randomId('item'),
      collection: collection.id
    }
  )

  const item2 = await getItem(t.context.api.client, collection.id, ingestedItem2.id)

  const assertHasResultCount = assertHasResultCountC(t)

  await assertHasResultCount(1, {
    ids: item2.id,
    datetime: '2015-02-19T15:06:12.565047Z'
  }, 'datetime with Z instead of 00:00 should match if field is datetime not string')

  await assertHasResultCount(1, {
    ids: item2.id,
    query: {
      gsd: {
        eq: 3.14
      }
    }
  }, 'decimal type is maintained even if first value is integral (default)')

  await assertHasResultCount(1, {
    ids: item2.id,
    query: {
      'eo:cloud_cover': {
        eq: 3.14
      }
    }
  }, 'decimal type is maintained even if first value is integral (default)')

  await assertHasResultCount(1, {
    ids: item2.id,
    query: {
      'proj:epsg': {
        eq: 32622
      }
    }
  }, 'integral type is used even if first value is decimal')

  await assertHasResultCount(0, {
    ids: item2.id,
    query: {
      'proj:epsg': {
        eq: 32622.1
      }
    }
  }, 'integral type is used even if first value is decimal')

  await assertHasResultCount(1, {
    ids: item2.id,
    query: {
      'sat:absolute_orbit': {
        eq: 2
      }
    }
  }, 'integral type is used even if first value is decimal')

  await assertHasResultCount(0, {
    ids: item2.id,
    query: {
      'sat:absolute_orbit': {
        eq: 2.1
      }
    }
  }, 'integral type is used even if first value is decimal')

  await assertHasResultCount(1, {
    ids: item2.id,
    query: {
      'sat:relative_orbit': {
        eq: 3
      }
    }
  }, 'integral type is used even if first value is decimal')

  await assertHasResultCount(0, {
    ids: item2.id,
    query: {
      'sat:relative_orbit': {
        eq: 3.1
      }
    }
  }, 'integral type is used even if first value is decimal')

  //
  await assertHasResultCount(1, {
    ids: item2.id,
    query: {
      'landsat:wrs_path': {
        eq: 'foo'
      }
    }
  }, 'numeric string value is not mapped to numeric type')

  // projjson was failing when indexed was not set to false
  t.deepEqual(item2.properties['proj:projjson'], ingestedItem2.properties['proj:projjson'])

  t.deepEqual(item2.properties['proj:centroid'], ingestedItem2.properties['proj:centroid'])
})
