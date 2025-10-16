// @ts-nocheck

import test from 'ava'
import { AssetProxy, BucketOption, ALTERNATE_ASSETS_EXTENSION } from '../../src/lib/asset-proxy.js'

test('BucketOption - exports expected constants', (t) => {
  t.is(BucketOption.NONE, 'NONE')
  t.is(BucketOption.ALL, 'ALL')
  t.is(BucketOption.ALL_BUCKETS_IN_ACCOUNT, 'ALL_BUCKETS_IN_ACCOUNT')
  t.is(BucketOption.LIST, 'LIST')
})

test('AssetProxy - constructor initializes with expected defaults', (t) => {
  const before = { ...process.env }
  try {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']

    const proxy = new AssetProxy()
    t.is(proxy.bucketOption, 'NONE')
    t.is(proxy.urlExpiry, 300)
  } finally {
    process.env = before
  }
})

test('AssetProxy - constructor reads env vars correctly', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'
    process.env['ASSET_PROXY_URL_EXPIRY'] = '600'
    process.env['ASSET_PROXY_BUCKET_LIST'] = 'bucket1,bucket2'

    const proxy = new AssetProxy()
    t.is(proxy.bucketOption, 'ALL')
    t.is(proxy.urlExpiry, 600)
    t.is(proxy.bucketList, 'bucket1,bucket2')
  } finally {
    process.env = before
  }
})

test('AssetProxy - initialize() with LIST mode parses bucket list', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'LIST'
    process.env['ASSET_PROXY_BUCKET_LIST'] = 'bucket1, bucket2 , bucket3'

    const proxy = new AssetProxy()
    await proxy.initialize()

    t.truthy(proxy.bucketsCache)
    t.true(proxy.bucketsCache.has('bucket1'))
    t.true(proxy.bucketsCache.has('bucket2'))
    t.true(proxy.bucketsCache.has('bucket3'))
    t.is(proxy.bucketsCache.size, 3)
  } finally {
    process.env = before
  }
})

test('AssetProxy - initialize() with LIST mode throws if no bucket list', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'LIST'
    delete process.env['ASSET_PROXY_BUCKET_LIST']

    const proxy = new AssetProxy()
    await t.throwsAsync(
      async () => proxy.initialize(),
      { message: /ASSET_PROXY_BUCKET_LIST must be set/ }
    )
  } finally {
    process.env = before
  }
})

test('AssetProxy - initialize() with ALL_BUCKETS_IN_ACCOUNT mode fetches buckets', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL_BUCKETS_IN_ACCOUNT'
    process.env['AWS_REGION'] = 'us-west-2'

    const proxy = new AssetProxy()

    const mockS3Client = {
      send: async () => ({
        Buckets: [
          { Name: 'bucket-1' },
          { Name: 'bucket-2' },
        ]
      })
    }

    proxy.getS3Client = () => mockS3Client

    await proxy.initialize()

    t.truthy(proxy.bucketsCache)
    t.true(proxy.bucketsCache.has('bucket-1'))
    t.true(proxy.bucketsCache.has('bucket-2'))
    t.true(!proxy.bucketsCache.has('some-other-bucket'))
    t.is(proxy.bucketsCache.size, 2)
  } finally {
    process.env = before
  }
})

test('AssetProxy - initialize() with ALL_BUCKETS_IN_ACCOUNT mode throws on error', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL_BUCKETS_IN_ACCOUNT'

    const proxy = new AssetProxy()

    const mockS3Client = {
      send: async () => {
        throw new Error('Access denied')
      }
    }

    proxy.getS3Client = () => mockS3Client

    await t.throwsAsync(
      async () => proxy.initialize(),
      { message: /Failed to fetch buckets for asset proxy: Access denied/ }
    )
  } finally {
    process.env = before
  }
})

test('AssetProxy - isEnabled() returns false for NONE', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'NONE'

    const proxy = new AssetProxy()
    t.false(proxy.isEnabled())
  } finally {
    process.env = before
  }
})

test('AssetProxy - isEnabled() returns true for ALL', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = new AssetProxy()
    t.true(proxy.isEnabled())
  } finally {
    process.env = before
  }
})

test('AssetProxy - isEnabled() returns true for LIST', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'LIST'
    process.env['ASSET_PROXY_BUCKET_LIST'] = 'bucket1'

    const proxy = new AssetProxy()
    await proxy.initialize()
    t.true(proxy.isEnabled())
  } finally {
    process.env = before
  }
})

test('AssetProxy - isEnabled() returns true for ALL_BUCKETS_IN_ACCOUNT', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL_BUCKETS_IN_ACCOUNT'

    const proxy = new AssetProxy()

    const mockS3Client = {
      send: async () => ({ Buckets: [{ Name: 'bucket-1' }] })
    }

    proxy.getS3Client = () => mockS3Client
    await proxy.initialize()

    t.true(proxy.isEnabled())
  } finally {
    process.env = before
  }
})

test('AssetProxy - shouldProxyBucket() with NONE mode returns false', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'NONE'

    const proxy = new AssetProxy()
    t.false(proxy.shouldProxyBucket('any-bucket'))
  } finally {
    process.env = before
  }
})

test('AssetProxy - shouldProxyBucket() with ALL mode returns true', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = new AssetProxy()
    t.true(proxy.shouldProxyBucket('any-bucket'))
    t.true(proxy.shouldProxyBucket('another-bucket'))
  } finally {
    process.env = before
  }
})

test('AssetProxy - shouldProxyBucket() with LIST mode only proxies buckets in list', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'LIST'
    process.env['ASSET_PROXY_BUCKET_LIST'] = 'allowed-bucket,another-allowed'

    const proxy = new AssetProxy()
    await proxy.initialize()

    t.true(proxy.shouldProxyBucket('allowed-bucket'))
    t.true(proxy.shouldProxyBucket('another-allowed'))
    t.false(proxy.shouldProxyBucket('not-in-list'))
  } finally {
    process.env = before
  }
})

test('AssetProxy - shouldProxyBucket() with ALL_BUCKETS_IN_ACCOUNT mode only proxies fetched buckets', async (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL_BUCKETS_IN_ACCOUNT'

    const proxy = new AssetProxy()

    const mockS3Client = {
      send: async () => ({
        Buckets: [
          { Name: 'fetched-bucket-1' },
          { Name: 'fetched-bucket-2' }
        ]
      })
    }

    proxy.getS3Client = () => mockS3Client
    await proxy.initialize()

    t.true(proxy.shouldProxyBucket('fetched-bucket-1'))
    t.true(proxy.shouldProxyBucket('fetched-bucket-2'))
    t.false(proxy.shouldProxyBucket('not-fetched-bucket'))
  } finally {
    process.env = before
  }
})

test('AssetProxy - getProxiedAssets() transforms item assets in ALL mode', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = new AssetProxy()
    const assets = {
      thumbnail: {
        href: 's3://my-bucket/thumb.jpg',
        type: 'image/jpeg'
      },
      data: {
        href: 'https://my-bucket.s3.us-west-2.amazonaws.com/data.tif',
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
    t.is(proxied.data.alternate.s3.href, 'https://my-bucket.s3.us-west-2.amazonaws.com/data.tif')
  } finally {
    process.env = before
  }
})

test('AssetProxy - getProxiedAssets() transforms collection assets', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = new AssetProxy()
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

test('AssetProxy - getProxiedAssets() does not transform assets in NONE mode', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'NONE'

    const proxy = new AssetProxy()
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

test('AssetProxy - getProxiedAssets() preserves existing alternate links', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = new AssetProxy()
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

test('AssetProxy - getProxiedAssets() does not transform non-S3 assets', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = new AssetProxy()
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

test('AssetProxy - getProxiedAssets() handles assets without href', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = new AssetProxy()
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

test('AssetProxy - getProxiedAssets() handles empty assets object', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = new AssetProxy()
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

test('AssetProxy - addProxiedAssets() mutates results and adds stac_extensions', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

    const proxy = new AssetProxy()
    const results = [{
      id: 'item1',
      collection: 'collection1',
      assets: {
        data: {
          href: 's3://my-bucket/data.tif'
        }
      }
    }]

    proxy.addProxiedAssets(results, 'https://api.example.com')

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

test('AssetProxy - addProxiedAssets() returns unchanged results when disabled', (t) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = 'NONE'

    const proxy = new AssetProxy()
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
    proxy.addProxiedAssets(results, 'https://api.example.com')

    t.is(results[0].assets.data.href, originalHref)
    t.is(results[0].assets.data.alternate, undefined)
  } finally {
    process.env = before
  }
})
