// @ts-nocheck

import url from 'url'
import test from 'ava'
import nock from 'nock'
import { DateTime } from 'luxon'
import { getCollectionIds, getItem } from '../helpers/api.js'
import { handler } from '../../src/lambdas/ingest/index.js'
import { loadFixture, randomId } from '../helpers/utils.js'
import { refreshIndices, deleteAllIndices } from '../helpers/database.js'
import { sqsTriggerLambda, purgeQueue } from '../helpers/sqs.js'
import { sns, sqs, s3 as _s3 } from '../../src/lib/aws-clients.js'
import { setup } from '../helpers/system-tests.js'
import { ingestItemC, ingestFixtureC, testPostIngestSNS } from '../helpers/ingest.js'

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

  delete process.env['ENABLE_INGEST_ACTION_TRUNCATE']
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
  })

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
    Bucket: sourceBucket,
    CreateBucketConfiguration: {
      LocationConstraint: 'us-west-2'
    }
  })

  await s3.putObject({
    Bucket: sourceBucket,
    Key: sourceKey,
    Body: JSON.stringify(collection)
  })

  await sns().publish({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify({ href: `s3://${sourceBucket}/${sourceKey}` })
  })

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
  })

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

test('Ingested collection is published to post-ingest SNS topic', async (t) => {
  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  const { message, attrs } = await testPostIngestSNS(t, collection)

  t.is(message.record.id, collection.id)
  t.is(attrs.collection.Value, collection.id)
  t.is(attrs.ingestStatus.Value, 'successful')
  t.is(attrs.recordType.Value, 'Collection')

  const bbox = collection.extent.spatial.bbox[0]
  t.is(bbox[0].toString(), attrs['bbox.sw_lon'].Value)
  t.is(bbox[1].toString(), attrs['bbox.sw_lat'].Value)
  t.is(bbox[2].toString(), attrs['bbox.ne_lon'].Value)
  t.is(bbox[3].toString(), attrs['bbox.ne_lat'].Value)

  const expectedStartOffsetValue = (new Date(collection.extent.temporal.interval[0][0]))
    .getTime().toString()
  t.is(expectedStartOffsetValue, attrs.start_unix_epoch_ms_offset.Value)
  t.is(
    (new Date(collection.extent.temporal.interval[0][0])).toISOString(),
    attrs.start_datetime.Value
  )
  t.is(undefined, attrs.end_unix_epoch_ms_offset)
  t.is(undefined, attrs.end_datetime)
})

test('Ingested collection is published to post-ingest SNS topic with updated links', async (t) => {
  const envBeforeTest = { ...process.env }
  try {
    const hostname = 'some-stac-server.com'
    const endpoint = `https://${hostname}`
    process.env['STAC_API_URL'] = endpoint

    const collection = await loadFixture(
      'landsat-8-l1-collection.json',
      { id: randomId('collection') }
    )

    const { message } = await testPostIngestSNS(t, collection)

    t.truthy(message.record.links)
    t.true(message.record.links.every((/** @type {Link} */ link) => (
      link.href && url.parse(link.href).hostname === hostname)))
  } finally {
    process.env = envBeforeTest
  }
})

test('Ingest collection failure is published to post-ingest SNS topic', async (t) => {
  const { message, attrs } = await testPostIngestSNS(t, {
    type: 'Collection',
    id: 'badCollection'
  }, true)

  t.is(message.record.id, 'badCollection')
  t.is(attrs.collection.Value, 'badCollection')
  t.is(attrs.ingestStatus.Value, 'failed')
  t.is(attrs.recordType.Value, 'Collection')
  t.is(undefined, attrs.start_unix_epoch_ms_offset)
  t.is(undefined, attrs.start_datetime)
  t.is(undefined, attrs.end_unix_epoch_ms_offset)
  t.is(undefined, attrs.end_datetime)
})

async function emptyPostIngestQueue(t) {
  // We initially tried calling
  // await sqs().purgeQueue({ QueueUrl: postIngestQueueUrl })
  // But at least one test would intermittently fail because of an additional
  // message in the queue.
  // The documentation for the purgeQueue method says:
  //   "The message deletion process takes up to 60 seconds.
  //    We recommend waiting for 60 seconds regardless of your queue's size."
  let result
  do {
    // eslint-disable-next-line no-await-in-loop
    result = await sqs().receiveMessage({
      QueueUrl: t.context.postIngestQueueUrl,
      WaitTimeSeconds: 1
    })
  } while (result.Message && result.Message.length > 0)
}

async function ingestCollectionAndPurgePostIngestQueue(t) {
  const { ingestFixture } = t.context

  const collection = await ingestFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  // Emptying the post-ingest queue ensures that subsequent calls to testPostIngestSNS
  // only see the message posted after the final ingest
  await emptyPostIngestQueue(t)

  return collection
}

test('Ingested item is published to post-ingest SNS topic', async (t) => {
  const collection = await ingestCollectionAndPurgePostIngestQueue(t)

  const item = await loadFixture(
    'stac/ingest-item.json',
    {
      id: randomId('item'),
      collection: collection.id
    }
  )

  item.properties.start_datetime = '1955-11-05T13:00:00.000Z'
  item.properties.end_datetime = '1985-11-05T13:00:00.000Z'

  const { message, attrs } = await testPostIngestSNS(t, item)

  t.is(message.record.id, item.id)
  t.deepEqual(message.record.links, item.links)
  t.is(attrs.collection.Value, item.collection)
  t.is(attrs.ingestStatus.Value, 'successful')
  t.is(attrs.recordType.Value, 'Item')

  t.is(item.bbox[0].toString(), attrs['bbox.sw_lon'].Value)
  t.is(item.bbox[1].toString(), attrs['bbox.sw_lat'].Value)
  t.is(item.bbox[2].toString(), attrs['bbox.ne_lon'].Value)
  t.is(item.bbox[3].toString(), attrs['bbox.ne_lat'].Value)

  t.is(message.record.properties.datetime, attrs.datetime.Value)

  const expectedStartOffsetValue = (new Date(item.properties.start_datetime)).getTime().toString()
  t.is(expectedStartOffsetValue, attrs.start_unix_epoch_ms_offset.Value)
  t.is(item.properties.start_datetime, attrs.start_datetime.Value)

  const expectedEndOffsetValue = (new Date(item.properties.end_datetime)).getTime().toString()
  t.is(expectedEndOffsetValue, attrs.end_unix_epoch_ms_offset.Value)
  t.is(item.properties.end_datetime, attrs.end_datetime.Value)
})

test('Ingest item failure is published to post-ingest SNS topic', async (t) => {
  await ingestCollectionAndPurgePostIngestQueue(t)

  // this fails because the collection does not exist
  const { message, attrs } = await testPostIngestSNS(t, {
    type: 'Feature',
    id: 'badItem',
    collection: 'non-existent',
  }, true)

  t.is(message.record.id, 'badItem')
  t.is(attrs.collection.Value, 'non-existent')
  t.is(attrs.ingestStatus.Value, 'failed')
  t.is(attrs.recordType.Value, 'Item')
})

test('Ingested item is published to post-ingest SNS topic with updated links', async (t) => {
  const envBeforeTest = { ...process.env }
  try {
    const hostname = 'some-stac-server.com'
    const endpoint = `https://${hostname}`
    process.env['STAC_API_URL'] = endpoint

    const collection = await ingestCollectionAndPurgePostIngestQueue(t)

    const item = await loadFixture(
      'stac/ingest-item.json',
      { id: randomId('item'), collection: collection.id }
    )

    const { message } = await testPostIngestSNS(t, item)

    t.truthy(message.record.links)
    t.true(message.record.links.every((/** @type {Link} */ link) => (
      link.href && url.parse(link.href).hostname === hostname)))
  } finally {
    process.env = envBeforeTest
  }
})

test('Ingested item failure is published to post-ingest SNS topic without updated links', async (t) => {
  const envBeforeTest = { ...process.env }
  try {
    const hostname = 'some-stac-server.com'
    const endpoint = `https://${hostname}`
    process.env['STAC_API_URL'] = endpoint

    const item = await loadFixture(
      'stac/ingest-item.json',
      { id: randomId('item'), collection: 'INVALID COLLECTION' }
    )

    const { message } = await testPostIngestSNS(t, item, true)

    t.truthy(message.record.links)
    t.false(message.record.links.every((/** @type {Link} */ link) => (
      link.href && url.parse(link.href).hostname === hostname)))
  } finally {
    process.env = envBeforeTest
  }
})

test('Truncate command fails when ENABLE_INGEST_ACTION_TRUNCATE is unset or not true', async (t) => {
  const { ingestFixture } = t.context

  const collection = await ingestFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  await t.throwsAsync(
    async () => ingestFixture(
      'truncate.json',
      {
        collection: collection.id,
      }
    ),
    { instanceOf: Error,
      message: 'There was at least one error ingesting items.' }
  )

  process.env['ENABLE_INGEST_ACTION_TRUNCATE'] = 'false'

  await t.throwsAsync(
    async () => ingestFixture(
      'truncate.json',
      {
        collection: collection.id,
      }
    ),
    { instanceOf: Error,
      message: 'There was at least one error ingesting items.' }
  )
})

test('Truncate command deletes items from collection', async (t) => {
  process.env['ENABLE_INGEST_ACTION_TRUNCATE'] = 'true'

  const { ingestFixture } = t.context
  const assertHasResultCount = assertHasResultCountC(t)

  const collection = await ingestFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  { // create some items to truncate
    const ITEM_COUNT = 13

    await Promise.all(
      Array.from({ length: ITEM_COUNT }, () =>
        ingestFixture(
          'stac/LC80100102015082LGN00.json',
          {
            id: randomId('item'),
            collection: collection.id,
          }
        ))
    )

    await assertHasResultCount(ITEM_COUNT, {
      collections: [collection.id],
      limit: 100,
    }, '')
  }

  // ingest the truncate command
  await ingestFixture(
    'truncate.json',
    {
      collection: collection.id,
    }
  )

  // check that the collection still exists
  {
    const response = await t.context.api.client.get('collections')
    t.true(Array.isArray(response.collections))
    t.true(response.collections.map((x) => x.id).includes(collection.id))

    await assertHasResultCount(0, {
      collections: [collection.id],
      limit: 100,
    }, '')
  }

  { // ingest more items
    const ITEM_COUNT = 19

    await Promise.all(
      Array.from({ length: ITEM_COUNT }, () =>
        ingestFixture(
          'stac/LC80100102015082LGN00.json',
          {
            id: randomId('item'),
            collection: collection.id,
          }
        ))
    )

    await assertHasResultCount(ITEM_COUNT, {
      collections: [collection.id],
      limit: 100,
    }, '')
  }
})

test('Truncate command fails for disallowed collection values', async (t) => {
  process.env['ENABLE_INGEST_ACTION_TRUNCATE'] = 'true'

  const { ingestFixture } = t.context

  // Test that truncate fails with various disallowed collection patterns
  const badCollections = ['', 'collections', '*', 'foo*']
  await Promise.all(badCollections.map((collection) =>
    t.throwsAsync(
      async () => ingestFixture('truncate.json', { collection }),
      { instanceOf: Error,
        message: 'There was at least one error ingesting items.' }
    )))
})

test('Unknown command fails ingest', async (t) => {
  process.env['ENABLE_INGEST_ACTION_TRUNCATE'] = 'true'

  const { ingestItem, ingestFixture } = t.context

  await t.throwsAsync(
    async () => ingestItem(
      {
        type: 'unknown'
      }
    ),
    { instanceOf: Error,
      message: 'There was at least one error ingesting items.' }
  )

  const collection = await ingestFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  await t.throwsAsync(
    async () => ingestItem(
      {
        type: 'action',
        command: 'non-existant-command',
        collection: collection.id
      }
    ),
    { instanceOf: Error,
      message: 'There was at least one error ingesting items.' }
  )
})
