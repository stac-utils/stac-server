// @ts-nocheck

import test from 'ava'
import { mockClient } from 'aws-sdk-client-mock'
import { S3Client, ListBucketsCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { AssetProxy, BucketOption, ALTERNATE_ASSETS_EXTENSION } from '../../src/lib/asset-proxy.js'

const s3Mock = mockClient(S3Client)

test.beforeEach(() => {
  s3Mock.reset()
})

test('BucketOption - exports expected constants', (t) => {
  t.is(BucketOption.NONE, 'NONE')
  t.is(BucketOption.ALL, 'ALL')
  t.is(BucketOption.ALL_BUCKETS_IN_ACCOUNT, 'ALL_BUCKETS_IN_ACCOUNT')
  t.is(BucketOption.LIST, 'LIST')
})

test.only('AssetProxy - constructor initializes with expected defaults', async (t) => {
  const before = { ...process.env }
  try {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']

    const proxy = await AssetProxy.create()
    t.is(proxy.urlExpiry, 300)
    t.is(proxy.isEnabled, false)
    t.is(proxy.buckets.bucketOption, 'NONE')
    t.is(proxy.buckets.bucketNames, null)
    t.deepEqual(proxy.buckets.buckets, {})
  } finally {
    process.env = before
  }
})

test('AssetProxy - LIST mode parses bucket list', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'LIST'
    process.env['ASSET_PROXY_BUCKET_LIST'] = 'bucket1, bucket2 , bucket3'

    s3Mock.on(HeadBucketCommand).resolves({
      $metadata: { httpStatusCode: 200 },
      BucketRegion: 'us-west-2'
    })

    const proxy = await AssetProxy.create()

    t.truthy(proxy.buckets)
    t.truthy(proxy.buckets.buckets['bucket1'])
    t.truthy(proxy.buckets.buckets['bucket2'])
    t.truthy(proxy.buckets.buckets['bucket3'])
    t.is(Object.keys(proxy.buckets.buckets).length, 3)
  } finally {
    process.env = before
  }
})

test('AssetProxy - LIST mode throws if no bucket list', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'LIST'
    delete process.env['ASSET_PROXY_BUCKET_LIST']

    await t.throwsAsync(
      async () => AssetProxy.create(),
      { message: /ASSET_PROXY_BUCKET_LIST must be set/ }
    )
  } finally {
    process.env = before
  }
})

test('AssetProxy - ALL_BUCKETS_IN_ACCOUNT mode fetches buckets', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL_BUCKETS_IN_ACCOUNT'
    process.env['AWS_REGION'] = 'us-west-2'

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

    const proxy = await AssetProxy.create()

    t.truthy(proxy.buckets)
    t.truthy(proxy.buckets.buckets['bucket-1'])
    t.truthy(proxy.buckets.buckets['bucket-2'])
    t.is(proxy.buckets.buckets['some-other-bucket'], undefined)
    t.is(Object.keys(proxy.buckets.buckets).length, 2)
  } finally {
    process.env = before
  }
})

test('AssetProxy - isEnabled returns false for NONE', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'NONE'

    const proxy = await AssetProxy.create()
    t.false(proxy.isEnabled)
  } finally {
    process.env = before
  }
})

test('AssetProxy - isEnabled returns true for ALL', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = await AssetProxy.create()
    t.true(proxy.isEnabled)
  } finally {
    process.env = before
  }
})

test('AssetProxy - isEnabled returns true for LIST', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'LIST'
    process.env['ASSET_PROXY_BUCKET_LIST'] = 'bucket1'

    s3Mock.on(HeadBucketCommand).resolves({
      $metadata: { httpStatusCode: 200 },
      BucketRegion: 'us-west-2'
    })

    const proxy = await AssetProxy.create()
    t.true(proxy.isEnabled)
  } finally {
    process.env = before
  }
})

test('AssetProxy - isEnabled returns true for ALL_BUCKETS_IN_ACCOUNT', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL_BUCKETS_IN_ACCOUNT'

    s3Mock.on(ListBucketsCommand).resolves({
      Buckets: [{ Name: 'bucket-1' }]
    })

    s3Mock.on(HeadBucketCommand).resolves({
      $metadata: { httpStatusCode: 200 },
      BucketRegion: 'us-west-2'
    })

    const proxy = await AssetProxy.create()

    t.true(proxy.isEnabled)
  } finally {
    process.env = before
  }
})

test('AssetProxy - bucket filtering with NONE mode returns false', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'NONE'

    const proxy = await AssetProxy.create()
    t.false(proxy.buckets.shouldProxyBucket('any-bucket'))
  } finally {
    process.env = before
  }
})

test('AssetProxy - bucket filtering with ALL mode returns true', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = await AssetProxy.create()
    t.true(proxy.buckets.shouldProxyBucket('any-bucket'))
    t.true(proxy.buckets.shouldProxyBucket('another-bucket'))
  } finally {
    process.env = before
  }
})

test('AssetProxy - bucket filtering with LIST mode only proxies buckets in list', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'LIST'
    process.env['ASSET_PROXY_BUCKET_LIST'] = 'allowed-bucket,another-allowed'

    s3Mock.on(HeadBucketCommand).resolves({
      $metadata: { httpStatusCode: 200 },
      BucketRegion: 'us-west-2'
    })

    const proxy = await AssetProxy.create()

    t.true(proxy.buckets.shouldProxyBucket('allowed-bucket'))
    t.true(proxy.buckets.shouldProxyBucket('another-allowed'))
    t.false(proxy.buckets.shouldProxyBucket('not-in-list'))
  } finally {
    process.env = before
  }
})

test('AssetProxy - bucket filtering with ALL_BUCKETS_IN_ACCOUNT mode only proxies fetched buckets', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL_BUCKETS_IN_ACCOUNT'

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

    const proxy = await AssetProxy.create()

    t.true(proxy.buckets.shouldProxyBucket('fetched-bucket-1'))
    t.true(proxy.buckets.shouldProxyBucket('fetched-bucket-2'))
    t.false(proxy.buckets.shouldProxyBucket('not-fetched-bucket'))
  } finally {
    process.env = before
  }
})

test('AssetProxy - getProxiedAssets() transforms item assets in ALL mode', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = await AssetProxy.create()
    const assets = {
      thumbnail: {
        href: 's3://my-bucket/thumb.jpg',
        type: 'image/jpeg'
      },
      data: {
        href: 's3://my-bucket/data.tif',
        type: 'image/tiff'
      }
    }

    const { assets: proxied, wasProxied } = proxy.getProxiedAssets(
      assets,
      'https://api.example.com',
      'collection1',
      'item1'
    )

    t.true(wasProxied)
    t.is(proxied.thumbnail.href, 'https://api.example.com/collections/collection1/items/item1/assets/thumbnail')
    t.is(proxied.thumbnail.alternate.s3.href, 's3://my-bucket/thumb.jpg')
    t.is(proxied.data.href, 'https://api.example.com/collections/collection1/items/item1/assets/data')
    t.is(proxied.data.alternate.s3.href, 's3://my-bucket/data.tif')
  } finally {
    process.env = before
  }
})

test('AssetProxy - getProxiedAssets() transforms collection assets', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = await AssetProxy.create()
    const assets = {
      thumbnail: {
        href: 's3://my-bucket/collection-thumb.jpg',
        type: 'image/jpeg'
      }
    }

    const { assets: proxied, wasProxied } = proxy.getProxiedAssets(
      assets,
      'https://api.example.com',
      'collection1',
      null
    )

    t.true(wasProxied)
    t.is(proxied.thumbnail.href, 'https://api.example.com/collections/collection1/assets/thumbnail')
    t.is(proxied.thumbnail.alternate.s3.href, 's3://my-bucket/collection-thumb.jpg')
  } finally {
    process.env = before
  }
})

test('AssetProxy - getProxiedAssets() does not transform assets in NONE mode', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'NONE'

    const proxy = await AssetProxy.create()
    const assets = {
      thumbnail: {
        href: 's3://my-bucket/thumb.jpg',
        type: 'image/jpeg'
      }
    }

    const { assets: proxied, wasProxied } = proxy.getProxiedAssets(
      assets,
      'https://api.example.com',
      'collection1',
      'item1'
    )

    t.false(wasProxied)
    t.is(proxied.thumbnail.href, 's3://my-bucket/thumb.jpg')
    t.is(proxied.thumbnail.alternate, undefined)
  } finally {
    process.env = before
  }
})

test('AssetProxy - getProxiedAssets() preserves existing alternate links', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = await AssetProxy.create()
    const assets = {
      data: {
        href: 's3://my-bucket/data.tif',
        type: 'image/tiff',
        alternate: {
          http: { href: 'https://example.com/data.tif' }
        }
      }
    }

    const { assets: proxied } = proxy.getProxiedAssets(
      assets,
      'https://api.example.com',
      'collection1',
      'item1'
    )

    t.is(proxied.data.alternate.http.href, 'https://example.com/data.tif')
    t.is(proxied.data.alternate.s3.href, 's3://my-bucket/data.tif')
  } finally {
    process.env = before
  }
})

test('AssetProxy - getProxiedAssets() does not transform non-S3 assets', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = await AssetProxy.create()
    const assets = {
      metadata: {
        href: 'https://example.com/metadata.xml',
        type: 'application/xml'
      }
    }

    const { assets: proxied, wasProxied } = proxy.getProxiedAssets(
      assets,
      'https://api.example.com',
      'collection1',
      'item1'
    )

    t.false(wasProxied)
    t.is(proxied.metadata.href, 'https://example.com/metadata.xml')
    t.is(proxied.metadata.alternate, undefined)
  } finally {
    process.env = before
  }
})

test('AssetProxy - getProxiedAssets() handles assets without href', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = await AssetProxy.create()
    const assets = {
      metadata: {
        type: 'application/xml'
      }
    }

    const { assets: proxied, wasProxied } = proxy.getProxiedAssets(
      assets,
      'https://api.example.com',
      'collection1',
      'item1'
    )

    t.false(wasProxied)
    t.deepEqual(proxied.metadata, { type: 'application/xml' })
  } finally {
    process.env = before
  }
})

test('AssetProxy - getProxiedAssets() handles empty assets object', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = await AssetProxy.create()
    const assets = {}

    const { assets: proxied, wasProxied } = proxy.getProxiedAssets(
      assets,
      'https://api.example.com',
      'collection1',
      'item1'
    )

    t.false(wasProxied)
    t.deepEqual(proxied, {})
  } finally {
    process.env = before
  }
})

test('AssetProxy - updateAssetHrefs() mutates results and adds the alternate assets extension', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = await AssetProxy.create()
    const results = [{
      id: 'item1',
      collection: 'collection1',
      assets: {
        data: {
          href: 's3://my-bucket/data.tif'
        }
      }
    }]

    proxy.updateAssetHrefs(results, 'https://api.example.com')

    t.truthy(results[0].assets)
    t.is(results[0].assets.data.href, 'https://api.example.com/collections/collection1/items/item1/assets/data')
    t.truthy(results[0].assets.data.alternate)
    t.is(results[0].assets.data.alternate.s3.href, 's3://my-bucket/data.tif')
    t.truthy(results[0].stac_extensions)
    t.true(results[0].stac_extensions.includes(ALTERNATE_ASSETS_EXTENSION))
  } finally {
    process.env = before
  }
})

test('AssetProxy - updateAssetHrefs() returns unchanged results when disabled', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'NONE'

    const proxy = await AssetProxy.create()
    const results = [{
      id: 'item1',
      collection: 'collection1',
      assets: {
        data: {
          href: 's3://my-bucket/data.tif'
        }
      }
    }]

    const originalHref = results[0].assets.data.href
    proxy.updateAssetHrefs(results, 'https://api.example.com')

    t.is(results[0].assets.data.href, originalHref)
    t.is(results[0].assets.data.alternate, undefined)
  } finally {
    process.env = before
  }
})
