// @ts-nocheck

import test from 'ava'
import { mockClient } from 'aws-sdk-client-mock'
import { S3Client, ListBucketsCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { AssetBuckets, BucketOptionEnum } from '../../src/lib/asset-buckets.js'

const s3Mock = mockClient(S3Client)

test.beforeEach(() => {
  s3Mock.reset()
})

test('BucketOptionEnum - exports expected constants', (t) => {
  t.is(BucketOptionEnum.NONE, 'NONE')
  t.is(BucketOptionEnum.ALL, 'ALL')
  t.is(BucketOptionEnum.ALL_BUCKETS_IN_ACCOUNT, 'ALL_BUCKETS_IN_ACCOUNT')
  t.is(BucketOptionEnum.LIST, 'LIST')
})

test('AssetBuckets - LIST mode parses bucket list', async (t) => {
  s3Mock.on(HeadBucketCommand).resolves({
    $metadata: { httpStatusCode: 200 },
    BucketRegion: 'us-west-2'
  })

  const buckets = await AssetBuckets.create(
    BucketOptionEnum.LIST,
    ['bucket1', 'bucket2', 'bucket3']
  )

  t.truthy(buckets.bucketCache['bucket1'])
  t.truthy(buckets.bucketCache['bucket2'])
  t.truthy(buckets.bucketCache['bucket3'])
  t.is(Object.keys(buckets.bucketCache).length, 3)
})

test('AssetBuckets - LIST mode throws if bucket list is empty', async (t) => {
  await t.throwsAsync(
    async () => AssetBuckets.create(BucketOptionEnum.LIST, []),
    { message: /ASSET_PROXY_BUCKET_LIST must not be empty/ }
  )
})

test('AssetBuckets - LIST mode throws if bucket list is null', async (t) => {
  await t.throwsAsync(
    async () => AssetBuckets.create(BucketOptionEnum.LIST, null),
    { message: /ASSET_PROXY_BUCKET_LIST must not be empty/ }
  )
})

test('AssetBuckets - LIST mode throws if bucket is inaccessible', async (t) => {
  s3Mock.on(HeadBucketCommand).rejects({
    name: '403',
    $metadata: { httpStatusCode: 403 }
  })

  await t.throwsAsync(
    async () => AssetBuckets.create(BucketOptionEnum.LIST, ['bucket1']),
    { message: /Could not access or determine region/ }
  )
})

test('AssetBuckets - ALL_BUCKETS_IN_ACCOUNT mode fetches buckets', async (t) => {
  s3Mock.on(ListBucketsCommand).resolves({
    Buckets: [
      { Name: 'bucket-1' },
      { Name: 'bucket-2' },
    ]
  })

  s3Mock.on(HeadBucketCommand).resolves({
    $metadata: { httpStatusCode: 200 },
    BucketRegion: 'us-west-2'
  })

  const buckets = await AssetBuckets.create(BucketOptionEnum.ALL_BUCKETS_IN_ACCOUNT, null)

  t.truthy(buckets.bucketCache['bucket-1'])
  t.truthy(buckets.bucketCache['bucket-2'])
  t.is(buckets.bucketCache['some-other-bucket'], undefined)
  t.is(Object.keys(buckets.bucketCache).length, 2)
})

test('AssetBuckets - shouldProxyBucket returns false for NONE mode', async (t) => {
  const buckets = await AssetBuckets.create(BucketOptionEnum.NONE, null)
  t.false(buckets.shouldProxyBucket('any-bucket'))
})

test('AssetBuckets - shouldProxyBucket returns true for ALL mode', async (t) => {
  const buckets = await AssetBuckets.create(BucketOptionEnum.ALL, null)
  t.true(buckets.shouldProxyBucket('any-bucket'))
  t.true(buckets.shouldProxyBucket('another-bucket'))
})

test('AssetBuckets - shouldProxyBucket with LIST mode only proxies buckets in list', async (t) => {
  s3Mock.on(HeadBucketCommand).resolves({
    $metadata: { httpStatusCode: 200 },
    BucketRegion: 'us-west-2'
  })

  const buckets = await AssetBuckets.create(
    BucketOptionEnum.LIST,
    ['allowed-bucket', 'another-allowed']
  )

  t.true(buckets.shouldProxyBucket('allowed-bucket'))
  t.true(buckets.shouldProxyBucket('another-allowed'))
  t.false(buckets.shouldProxyBucket('not-in-list'))
})

test('AssetBuckets - shouldProxyBucket with ALL_BUCKETS_IN_ACCOUNT mode only proxies fetched buckets', async (t) => {
  s3Mock.on(ListBucketsCommand).resolves({
    Buckets: [
      { Name: 'fetched-bucket-1' },
      { Name: 'fetched-bucket-2' }
    ]
  })

  s3Mock.on(HeadBucketCommand).resolves({
    $metadata: { httpStatusCode: 200 },
    BucketRegion: 'us-west-2'
  })

  const buckets = await AssetBuckets.create(BucketOptionEnum.ALL_BUCKETS_IN_ACCOUNT, null)

  t.true(buckets.shouldProxyBucket('fetched-bucket-1'))
  t.true(buckets.shouldProxyBucket('fetched-bucket-2'))
  t.false(buckets.shouldProxyBucket('not-fetched-bucket'))
})

// Using serial to prevent HeadBucketCommand mock interference between tests
test.serial('AssetBuckets - getBucket handles 403 access denied', async (t) => {
  s3Mock.on(HeadBucketCommand).rejects({
    name: '403',
    $metadata: { httpStatusCode: 403 }
  })

  const buckets = await AssetBuckets.create(BucketOptionEnum.ALL, null)
  const bucket = await buckets.getBucket('denied-bucket')

  t.is(bucket.name, null)
  t.is(bucket.region, null)
})

// Using serial to prevent HeadBucketCommand mock interference between tests
test.serial('AssetBuckets - getBucket handles 404 not found', async (t) => {
  s3Mock.on(HeadBucketCommand).rejects({
    name: '404',
    $metadata: { httpStatusCode: 404 }
  })

  const buckets = await AssetBuckets.create(BucketOptionEnum.ALL, null)
  const bucket = await buckets.getBucket('missing-bucket')

  t.is(bucket.name, null)
  t.is(bucket.region, null)
})

// Using serial to prevent HeadBucketCommand mock interference between tests
test.serial('AssetBuckets - getBucket caches bucket info', async (t) => {
  s3Mock.on(HeadBucketCommand).resolves({
    $metadata: { httpStatusCode: 200 },
    BucketRegion: 'us-west-2'
  })

  const buckets = await AssetBuckets.create(BucketOptionEnum.ALL, null)

  const bucket1 = await buckets.getBucket('test-bucket')
  const bucket2 = await buckets.getBucket('test-bucket')

  t.is(bucket1, bucket2)
  t.is(s3Mock.commandCalls(HeadBucketCommand).length, 1)
})

// Using serial to prevent HeadBucketCommand mock interference between tests
test.serial('AssetBuckets - getBucket handles EU region', async (t) => {
  s3Mock.on(HeadBucketCommand).resolves({
    $metadata: { httpStatusCode: 200 },
    BucketRegion: 'EU'
  })

  const buckets = await AssetBuckets.create(BucketOptionEnum.ALL, null)
  const bucket = await buckets.getBucket('eu-bucket')

  t.is(bucket.name, 'eu-bucket')
  t.is(bucket.region, 'eu-west-1')
})

// Using serial to prevent HeadBucketCommand mock interference between tests
test.serial('AssetBuckets - getBucket defaults to us-east-1 when region is missing', async (t) => {
  s3Mock.on(HeadBucketCommand).resolves({
    $metadata: { httpStatusCode: 200 }
  })

  const buckets = await AssetBuckets.create(BucketOptionEnum.ALL, null)
  const bucket = await buckets.getBucket('default-region-bucket')

  t.is(bucket.name, 'default-region-bucket')
  t.is(bucket.region, 'us-east-1')
})
