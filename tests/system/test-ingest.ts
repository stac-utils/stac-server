import url from 'url'
import test from 'ava'
import type { ExecutionContext } from 'ava'
import nock from 'nock'
import { DateTime } from 'luxon'
import { PublishCommand } from '@aws-sdk/client-sns'
import { ReceiveMessageCommand } from '@aws-sdk/client-sqs'
import { CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getCollectionIds, getItem } from '../helpers/api.js'
import { handler, resetAssetProxy } from '../../src/lambdas/ingest/index.js'
import { loadFixture, randomId } from '../helpers/utils.js'
import { refreshIndices, deleteAllIndices } from '../helpers/database.js'
import { sqsTriggerLambda, purgeQueue } from '../helpers/sqs.js'
import { sns, sqs, s3 as _s3 } from '../../src/lib/aws-clients.js'
import { ALTERNATE_ASSETS_EXTENSION } from '../../src/lib/asset-proxy.js'
import { setup } from '../helpers/system-tests.js'
import type { StandUpResult } from '../helpers/system-tests.js'
import { ingestItemC, ingestFixtureC, testPostIngestSNS } from '../helpers/ingest.js'

type TestContext = StandUpResult & {
  ingestItem: (item: unknown) => Promise<void>
  ingestFixture: (
    filename: string,
    overrides?: Record<string, unknown>
  ) => Promise<Record<string, unknown>>
}

test.before(async (t: ExecutionContext<TestContext>) => {
  await deleteAllIndices()
  const standUpResult = await setup()

  t.context = standUpResult as TestContext

  t.context.ingestItem = ingestItemC(
    standUpResult.ingestTopicArn,
    standUpResult.ingestQueueUrl
  )
  t.context.ingestFixture = ingestFixtureC(
    standUpResult.ingestTopicArn,
    standUpResult.ingestQueueUrl
  )
})

test.beforeEach(async (t: ExecutionContext<TestContext>) => {
  const { ingestQueueUrl } = t.context

  if (ingestQueueUrl === undefined) throw new Error('No ingest queue url')

  await purgeQueue(ingestQueueUrl)

  delete process.env['ENABLE_INGEST_ACTION_TRUNCATE']
})

test.afterEach.always(() => {
  nock.cleanAll()
})

test('The ingest lambda supports ingesting a collection published to SNS', async (t: ExecutionContext<TestContext>) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

  if (ingestTopicArn === undefined) throw new Error('No ingest topic ARN')

  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  const publishCommand = new PublishCommand({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify(collection)
  })
  await sns().send(publishCommand)

  await sqsTriggerLambda(ingestQueueUrl, handler)

  await refreshIndices()

  const collectionIds = await getCollectionIds(t.context.api.client)

  t.true(collectionIds.includes(collection['id'] as string))
})

test('The ingest lambda supports ingesting a collection sourced from S3', async (t: ExecutionContext<TestContext>) => {
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

  const createBucketCommand = new CreateBucketCommand({
    Bucket: sourceBucket,
    CreateBucketConfiguration: {
      LocationConstraint: 'us-west-2'
    }
  })
  await s3.send(createBucketCommand)

  const putObjectCommand = new PutObjectCommand({
    Bucket: sourceBucket,
    Key: sourceKey,
    Body: JSON.stringify(collection)
  })
  await s3.send(putObjectCommand)

  const publishCommand2 = new PublishCommand({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify({ href: `s3://${sourceBucket}/${sourceKey}` })
  })
  await sns().send(publishCommand2)

  await sqsTriggerLambda(ingestQueueUrl, handler)

  await refreshIndices()

  const collectionIds = await getCollectionIds(t.context.api.client)

  t.true(collectionIds.includes(collection['id'] as string))
})

test('The ingest lambda supports ingesting a collection sourced from http', async (t: ExecutionContext<TestContext>) => {
  const { ingestQueueUrl, ingestTopicArn } = t.context

  if (ingestTopicArn === undefined) throw new Error('No ingest topic ARN')

  // Load the collection to be ingested
  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  nock('http://source.local').get('/my-file.dat').reply(200, collection)

  const publishCommand3 = new PublishCommand({
    TopicArn: ingestTopicArn,
    Message: JSON.stringify({ href: 'http://source.local/my-file.dat' })
  })
  await sns().send(publishCommand3)

  await sqsTriggerLambda(ingestQueueUrl, handler)

  await refreshIndices()

  const collectionIds = await getCollectionIds(t.context.api.client)

  t.true(collectionIds.includes(collection['id'] as string))
})

test('Reingesting an item maintains the `created` value and updates `updated`', async (t: ExecutionContext<TestContext>) => {
  const { ingestFixture, ingestItem } = t.context

  const collection = await ingestFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  const item = await ingestFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: randomId('item'),
      collection: collection['id']
    }
  )

  const originalItem = await getItem(t.context.api.client, collection['id'] as string, item['id'] as string)
  // @ts-expect-error We need to validate these responses
  const originalCreated = DateTime.fromISO(originalItem.properties.created)
  // @ts-expect-error We need to validate these responses
  const originalUpdated = DateTime.fromISO(originalItem.properties.updated)

  await ingestItem(item)

  const updatedItem = await getItem(t.context.api.client, collection['id'] as string, item['id'] as string)
  // @ts-expect-error We need to validate these responses
  const updatedCreated = DateTime.fromISO(updatedItem.properties.created)
  // @ts-expect-error We need to validate these responses
  const updatedUpdated = DateTime.fromISO(updatedItem.properties.updated)

  t.is(updatedCreated.toISO(), originalCreated.toISO())
  t.true(updatedUpdated.toISO() > originalUpdated.toISO())
})

test('Reingesting an item removes extra fields', async (t: ExecutionContext<TestContext>) => {
  const { ingestFixture, ingestItem } = t.context

  const collection = await ingestFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  const { properties, ...item } = await loadFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: randomId('item'),
      collection: collection['id']
    }
  )

  const originalItem = {
    ...item,
    properties: {
      ...(properties as Record<string, unknown>),
      extra: 'hello'
    }
  }

  await ingestItem(originalItem)

  const originalFetchedItem = await getItem(
    t.context.api.client, collection['id'] as string, item['id'] as string
  )

  // @ts-expect-error We need to validate these responses
  t.is(originalFetchedItem.properties.extra, 'hello')

  // The new item is the same as the old, except that it does not have properties.extra
  const updatedItem = {
    ...item,
    properties
  }

  await ingestItem(updatedItem)

  const updatedFetchedItem = await getItem(
    t.context.api.client, collection['id'] as string, item['id'] as string
  )

  // @ts-expect-error We need to validate these responses
  t.false('extra' in updatedFetchedItem.properties)
})

const assertHasResultCountC = (t: ExecutionContext<TestContext>) =>
  async (count: number, searchBody: unknown, message: string) => {
    const response = await t.context.api.client.post('search', { json: searchBody })
    // @ts-expect-error We need to validate these responses
    t.true(Array.isArray(response.features), message)
    // @ts-expect-error We need to validate these responses
    t.is(response.features.length, count, message)
  }

test('Mappings are correctly configured for non-default detected fields', async (t: ExecutionContext<TestContext>) => {
  const { ingestFixture } = t.context

  const collection = await ingestFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  await ingestFixture(
    'stac/mapping-item1.json',
    {
      id: randomId('item'),
      collection: collection['id']
    }
  )

  const ingestedItem2 = await ingestFixture(
    'stac/mapping-item2.json',
    {
      id: randomId('item'),
      collection: collection['id']
    }
  )

  const item2 = await getItem(
    t.context.api.client, collection['id'] as string, ingestedItem2['id'] as string
  )

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

  await assertHasResultCount(1, {
    ids: item2.id,
    query: {
      'landsat:wrs_path': {
        eq: 'foo'
      }
    }
  }, 'numeric string value is not mapped to numeric type')

  // projjson was failing when indexed was not set to false
  // @ts-expect-error We need to validate these responses
  t.deepEqual(item2.properties['proj:projjson'], ingestedItem2['properties']['proj:projjson'])

  // @ts-expect-error We need to validate these responses
  t.deepEqual(item2.properties['proj:centroid'], ingestedItem2['properties']['proj:centroid'])
})

test('Ingested collection is published to post-ingest SNS topic', async (t: ExecutionContext<TestContext>) => {
  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  // @ts-expect-error testPostIngestSNS uses a compatible subset of TestContext
  const { message, attrs } = await testPostIngestSNS(t, collection)

  t.is(message.record.id, collection['id'])
  t.is(attrs.collection.Value, collection['id'])
  t.is(attrs.ingestStatus.Value, 'successful')
  t.is(attrs.recordType.Value, 'Collection')

  const bbox = (collection['extent'] as Record<string, unknown>)
  const spatialBbox = (bbox['spatial'] as Record<string, unknown>)['bbox'] as number[][]
  t.is(spatialBbox[0][0].toString(), attrs['bbox.sw_lon'].Value)
  t.is(spatialBbox[0][1].toString(), attrs['bbox.sw_lat'].Value)
  t.is(spatialBbox[0][2].toString(), attrs['bbox.ne_lon'].Value)
  t.is(spatialBbox[0][3].toString(), attrs['bbox.ne_lat'].Value)

  const temporal = (bbox['temporal'] as Record<string, unknown>)['interval'] as string[][]
  const expectedStartOffsetValue = (new Date(temporal[0][0])).getTime().toString()
  t.is(expectedStartOffsetValue, attrs.start_unix_epoch_ms_offset.Value)
  t.is((new Date(temporal[0][0])).toISOString(), attrs.start_datetime.Value)
  t.is(undefined, attrs.end_unix_epoch_ms_offset)
  t.is(undefined, attrs.end_datetime)
})

test('Ingested collection is published to post-ingest SNS topic with updated links', async (t: ExecutionContext<TestContext>) => {
  const envBeforeTest = { ...process.env }
  try {
    const hostname = 'some-stac-server.com'
    const endpoint = `https://${hostname}`
    process.env['STAC_API_URL'] = endpoint

    const collection = await loadFixture(
      'landsat-8-l1-collection.json',
      { id: randomId('collection') }
    )

    // @ts-expect-error testPostIngestSNS uses a compatible subset of TestContext
    const { message } = await testPostIngestSNS(t, collection)

    t.truthy(message.record.links)
    t.true(message.record.links.every((link: { href: string }) => (
      link.href && url.parse(link.href).hostname === hostname)))
  } finally {
    process.env = envBeforeTest
  }
})

test('Ingest collection failure is published to post-ingest SNS topic', async (t: ExecutionContext<TestContext>) => {
  const badId = '_badCollection'
  // @ts-expect-error testPostIngestSNS uses a compatible subset of TestContext
  const { message, attrs } = await testPostIngestSNS(t, {
    type: 'Collection',
    id: badId
  }, true)

  t.is(message.record.id, badId)
  t.is(attrs.collection.Value, badId)
  t.is(attrs.ingestStatus.Value, 'failed')
  t.is(attrs.recordType.Value, 'Collection')
  t.is(undefined, attrs.start_unix_epoch_ms_offset)
  t.is(undefined, attrs.start_datetime)
  t.is(undefined, attrs.end_unix_epoch_ms_offset)
  t.is(undefined, attrs.end_datetime)
})

async function emptyPostIngestQueue(t: ExecutionContext<TestContext>) {
  // We initially tried calling
  // await sqs().purgeQueue({ QueueUrl: postIngestQueueUrl })
  // But at least one test would intermittently fail because of an additional
  // message in the queue.
  // The documentation for the purgeQueue method says:
  //   "The message deletion process takes up to 60 seconds.
  //    We recommend waiting for 60 seconds regardless of your queue's size."
  let result
  do {
    const receiveCommand = new ReceiveMessageCommand({
      QueueUrl: t.context.postIngestQueueUrl,
      WaitTimeSeconds: 1
    })
    // eslint-disable-next-line no-await-in-loop
    result = await sqs().send(receiveCommand)
  } while (result.Message && result.Message.length > 0)
}

async function ingestCollectionAndPurgePostIngestQueue(t: ExecutionContext<TestContext>) {
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

test('Ingested item is published to post-ingest SNS topic', async (t: ExecutionContext<TestContext>) => {
  const collection = await ingestCollectionAndPurgePostIngestQueue(t)

  const item = await loadFixture(
    'stac/ingest-item.json',
    {
      id: randomId('item'),
      collection: collection['id']
    }
  )

  item['properties'] = {
    ...(item['properties'] as Record<string, unknown>),
    start_datetime: '1955-11-05T13:00:00.000Z',
    end_datetime: '1985-11-05T13:00:00.000Z'
  }

  // @ts-expect-error testPostIngestSNS uses a compatible subset of TestContext
  const { message, attrs } = await testPostIngestSNS(t, item)

  t.is(message.record.id, item['id'])
  t.deepEqual(message.record.links, item['links'])
  t.is(attrs.collection.Value, item['collection'])
  t.is(attrs.ingestStatus.Value, 'successful')
  t.is(attrs.recordType.Value, 'Item')

  const bbox = item['bbox'] as number[]
  t.is(bbox[0].toString(), attrs['bbox.sw_lon'].Value)
  t.is(bbox[1].toString(), attrs['bbox.sw_lat'].Value)
  t.is(bbox[2].toString(), attrs['bbox.ne_lon'].Value)
  t.is(bbox[3].toString(), attrs['bbox.ne_lat'].Value)

  const props = item['properties'] as Record<string, unknown>
  t.is(message.record.properties.datetime, attrs.datetime.Value)

  const expectedStartOffsetValue = (new Date(props['start_datetime'] as string)).getTime().toString()
  t.is(expectedStartOffsetValue, attrs.start_unix_epoch_ms_offset.Value)
  t.is(props['start_datetime'], attrs.start_datetime.Value)

  const expectedEndOffsetValue = (new Date(props['end_datetime'] as string)).getTime().toString()
  t.is(expectedEndOffsetValue, attrs.end_unix_epoch_ms_offset.Value)
  t.is(props['end_datetime'], attrs.end_datetime.Value)
})

test('Ingest item failure is published to post-ingest SNS topic', async (t: ExecutionContext<TestContext>) => {
  await ingestCollectionAndPurgePostIngestQueue(t)

  // this fails because the collection does not exist
  // @ts-expect-error testPostIngestSNS uses a compatible subset of TestContext
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

test('Ingested item is published to post-ingest SNS topic with updated links', async (t: ExecutionContext<TestContext>) => {
  const envBeforeTest = { ...process.env }
  try {
    const hostname = 'some-stac-server.com'
    const endpoint = `https://${hostname}`
    process.env['STAC_API_URL'] = endpoint

    const collection = await ingestCollectionAndPurgePostIngestQueue(t)

    const item = await loadFixture(
      'stac/ingest-item.json',
      { id: randomId('item'), collection: collection['id'] }
    )

    // @ts-expect-error testPostIngestSNS uses a compatible subset of TestContext
    const { message } = await testPostIngestSNS(t, item)

    t.truthy(message.record.links)
    t.true(message.record.links.every((link: { href: string }) => (
      link.href && url.parse(link.href).hostname === hostname)))
  } finally {
    process.env = envBeforeTest
  }
})

test('Ingested item is published to post-ingest SNS topic with proxied assets', async (t: ExecutionContext<TestContext>) => {
  const envBeforeTest = { ...process.env }
  try {
    const endpoint = 'https://some-stac-server.com'
    process.env['STAC_API_URL'] = endpoint
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'
    resetAssetProxy()

    const collection = await ingestCollectionAndPurgePostIngestQueue(t)
    const item = await loadFixture(
      'stac/ingest-item.json',
      { id: randomId('item'), collection: collection['id'] }
    )

    const firstAssetKey = Object.keys(item['assets'] as Record<string, unknown>)[0]
    const assets = item['assets'] as Record<string, Record<string, unknown>>
    const originalHref = assets[firstAssetKey]['href']

    // @ts-expect-error testPostIngestSNS uses a compatible subset of TestContext
    const { message } = await testPostIngestSNS(t, item)
    const firstAsset = message.record.assets[firstAssetKey]

    t.true(firstAsset.href.includes(endpoint))
    t.is(firstAsset.alternate.s3.href, originalHref)
    t.true(message.record.stac_extensions.includes(ALTERNATE_ASSETS_EXTENSION))
  } finally {
    process.env = envBeforeTest
  }
})

test('Ingested item failure is published to post-ingest SNS topic without updated links', async (t: ExecutionContext<TestContext>) => {
  const envBeforeTest = { ...process.env }
  try {
    const hostname = 'some-stac-server.com'
    const endpoint = `https://${hostname}`
    process.env['STAC_API_URL'] = endpoint

    const item = await loadFixture(
      'stac/ingest-item.json',
      { id: randomId('item'), collection: 'INVALID COLLECTION' }
    )

    // @ts-expect-error testPostIngestSNS uses a compatible subset of TestContext
    const { message } = await testPostIngestSNS(t, item, true)

    t.truthy(message.record.links)
    t.false(message.record.links.every((link: { href: string }) => (
      link.href && url.parse(link.href).hostname === hostname)))
  } finally {
    process.env = envBeforeTest
  }
})

test('Truncate command fails when ENABLE_INGEST_ACTION_TRUNCATE is unset or not true', async (t: ExecutionContext<TestContext>) => {
  const { ingestFixture } = t.context

  const collection = await ingestFixture(
    'landsat-8-l1-collection.json',
    { id: randomId('collection') }
  )

  await t.throwsAsync(
    async () => ingestFixture(
      'truncate.json',
      {
        collection: collection['id'],
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
        collection: collection['id'],
      }
    ),
    { instanceOf: Error,
      message: 'There was at least one error ingesting items.' }
  )
})

test('Truncate command deletes items from collection', async (t: ExecutionContext<TestContext>) => {
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
            collection: collection['id'],
          }
        ))
    )

    await assertHasResultCount(ITEM_COUNT, {
      collections: [collection['id']],
      limit: 100,
    }, '')
  }

  // ingest the truncate command
  await ingestFixture(
    'truncate.json',
    {
      collection: collection['id'],
    }
  )

  // check that the collection still exists
  {
    const response = await t.context.api.client.get('collections')
    // @ts-expect-error We need to validate these responses
    t.true(Array.isArray(response.collections))
    // @ts-expect-error We need to validate these responses
    t.true(response.collections.map((x: { id: string }) => x.id).includes(collection['id']))

    await assertHasResultCount(0, {
      collections: [collection['id']],
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
            collection: collection['id'],
          }
        ))
    )

    await assertHasResultCount(ITEM_COUNT, {
      collections: [collection['id']],
      limit: 100,
    }, '')
  }
})

test('Truncate command fails for disallowed collection values', async (t: ExecutionContext<TestContext>) => {
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

test('Unknown command fails ingest', async (t: ExecutionContext<TestContext>) => {
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
        command: 'non-existent-command',
        collection: collection['id']
      }
    ),
    { instanceOf: Error,
      message: 'There was at least one error ingesting items.' }
  )
})
