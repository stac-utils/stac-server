import test from 'ava'
import {
  parseS3Url,
  proxyAssets,
  shouldProxyAssets,
  determineS3Region,
  BucketOption
} from '../../src/lib/asset-proxy.js'

test('parseS3Url - s3:// URI format', (t) => {
  const result = parseS3Url('s3://my-bucket/path/to/file.tif')
  t.deepEqual(result, { bucket: 'my-bucket', key: 'path/to/file.tif', region: null })
})

test('parseS3Url - virtual-hosted style with region', (t) => {
  const result = parseS3Url('https://my-bucket.s3.us-west-2.amazonaws.com/path/to/file.tif')
  t.deepEqual(result, { bucket: 'my-bucket', key: 'path/to/file.tif', region: 'us-west-2' })
})

test('parseS3Url - virtual-hosted style without region', (t) => {
  const result = parseS3Url('https://my-bucket.s3.amazonaws.com/path/to/file.tif')
  t.deepEqual(result, { bucket: 'my-bucket', key: 'path/to/file.tif', region: null })
})

test('parseS3Url - path style with region (dot format)', (t) => {
  const result = parseS3Url('https://s3.us-east-1.amazonaws.com/my-bucket/path/to/file.tif')
  t.deepEqual(result, { bucket: 'my-bucket', key: 'path/to/file.tif', region: 'us-east-1' })
})

test('parseS3Url - path style with region (hyphen format - legacy)', (t) => {
  const result = parseS3Url('https://s3-us-west-2.amazonaws.com/landsat-pds/L8/file.tif')
  t.deepEqual(result, { bucket: 'landsat-pds', key: 'L8/file.tif', region: 'us-west-2' })
})

test('parseS3Url - path style without region', (t) => {
  const result = parseS3Url('https://s3.amazonaws.com/my-bucket/path/to/file.tif')
  t.deepEqual(result, { bucket: 'my-bucket', key: 'path/to/file.tif', region: null })
})

test('parseS3Url - invalid URLs', (t) => {
  t.is(parseS3Url('https://example.com/file.tif'), null)
  t.is(parseS3Url('s3://bucket'), null)
  t.is(parseS3Url(''), null)
})

test('shouldProxyAssets - ALL mode', (t) => {
  const config = {
    enabled: true,
    mode: BucketOption.ALL,
    buckets: new Set(),
    urlExpiry: 300
  }
  t.true(shouldProxyAssets('any-bucket', config))
})

test('shouldProxyAssets - NONE mode', (t) => {
  const config = {
    enabled: false,
    mode: BucketOption.NONE,
    buckets: new Set(),
    urlExpiry: 300
  }
  t.false(shouldProxyAssets('any-bucket', config))
})

test('shouldProxyAssets - LIST mode with matching bucket', (t) => {
  const config = {
    enabled: true,
    mode: BucketOption.LIST,
    buckets: new Set(['bucket1', 'bucket2']),
    urlExpiry: 300
  }
  t.true(shouldProxyAssets('bucket1', config))
  t.false(shouldProxyAssets('bucket3', config))
})

test('shouldProxyAssets - ALL_BUCKETS_IN_ACCOUNT mode', (t) => {
  const config = {
    enabled: true,
    mode: BucketOption.ALL_BUCKETS_IN_ACCOUNT,
    buckets: new Set(['account-bucket-1', 'account-bucket-2']),
    urlExpiry: 300
  }
  t.true(shouldProxyAssets('account-bucket-1', config))
  t.false(shouldProxyAssets('other-bucket', config))
})

test('proxyAssets - transforms assets with ALL mode', (t) => {
  const config = {
    enabled: true,
    mode: BucketOption.ALL,
    buckets: new Set(),
    urlExpiry: 300
  }

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

  const { assets: proxied, wasProxied } = proxyAssets(
    assets,
    'https://api.example.com',
    'collection1',
    'item1',
    config
  )

  t.true(wasProxied)
  t.is(proxied.thumbnail.href, 'https://api.example.com/collections/collection1/items/item1/assets/thumbnail')
  t.is(proxied.thumbnail.alternate.s3.href, 's3://my-bucket/thumb.jpg')
  t.is(proxied.data.href, 'https://api.example.com/collections/collection1/items/item1/assets/data')
  t.is(proxied.data.alternate.s3.href, 'https://my-bucket.s3.us-west-2.amazonaws.com/data.tif')
})

test('proxyAssets - no transformation with NONE mode', (t) => {
  const config = {
    enabled: false,
    mode: BucketOption.NONE,
    buckets: new Set(),
    urlExpiry: 300
  }

  const assets = {
    thumbnail: {
      href: 's3://my-bucket/thumb.jpg',
      type: 'image/jpeg'
    }
  }

  const { assets: proxied, wasProxied } = proxyAssets(
    assets,
    'https://api.example.com',
    'collection1',
    'item1',
    config
  )

  t.false(wasProxied)
  t.is(proxied.thumbnail.href, 's3://my-bucket/thumb.jpg')
  t.is(proxied.thumbnail.alternate, undefined)
})

test('proxyAssets - LIST mode only transforms matching buckets', (t) => {
  const config = {
    enabled: true,
    mode: BucketOption.LIST,
    buckets: new Set(['proxied-bucket']),
    urlExpiry: 300
  }

  const assets = {
    proxied: {
      href: 's3://proxied-bucket/file.tif',
      type: 'image/tiff'
    },
    notProxied: {
      href: 's3://other-bucket/file.tif',
      type: 'image/tiff'
    }
  }

  const { assets: proxied, wasProxied } = proxyAssets(
    assets,
    'https://api.example.com',
    'collection1',
    'item1',
    config
  )

  t.true(wasProxied)
  t.is(proxied.proxied.href, 'https://api.example.com/collections/collection1/items/item1/assets/proxied')
  t.is(proxied.notProxied.href, 's3://other-bucket/file.tif')
  t.is(proxied.notProxied.alternate, undefined)
})

test('proxyAssets - collection assets (no itemId)', (t) => {
  const config = {
    enabled: true,
    mode: BucketOption.ALL,
    buckets: new Set(),
    urlExpiry: 300
  }

  const assets = {
    thumbnail: {
      href: 's3://my-bucket/collection-thumb.jpg',
      type: 'image/jpeg'
    }
  }

  const { assets: proxied, wasProxied } = proxyAssets(
    assets,
    'https://api.example.com',
    'collection1',
    null,
    config
  )

  t.true(wasProxied)
  t.is(proxied.thumbnail.href, 'https://api.example.com/collections/collection1/assets/thumbnail')
  t.is(proxied.thumbnail.alternate.s3.href, 's3://my-bucket/collection-thumb.jpg')
})

test('proxyAssets - preserves existing alternate links', (t) => {
  const config = {
    enabled: true,
    mode: BucketOption.ALL,
    buckets: new Set(),
    urlExpiry: 300
  }

  const assets = {
    data: {
      href: 's3://my-bucket/data.tif',
      type: 'image/tiff',
      alternate: {
        http: { href: 'https://example.com/data.tif' }
      }
    }
  }

  const { assets: proxied } = proxyAssets(
    assets,
    'https://api.example.com',
    'collection1',
    'item1',
    config
  )

  t.is(proxied.data.alternate.http.href, 'https://example.com/data.tif')
  t.is(proxied.data.alternate.s3.href, 's3://my-bucket/data.tif')
})

test('proxyAssets - handles non-S3 assets', (t) => {
  const config = {
    enabled: true,
    mode: BucketOption.ALL,
    buckets: new Set(),
    urlExpiry: 300
  }

  const assets = {
    metadata: {
      href: 'https://example.com/metadata.xml',
      type: 'application/xml'
    }
  }

  const { assets: proxied, wasProxied } = proxyAssets(
    assets,
    'https://api.example.com',
    'collection1',
    'item1',
    config
  )

  t.false(wasProxied)
  t.is(proxied.metadata.href, 'https://example.com/metadata.xml')
  t.is(proxied.metadata.alternate, undefined)
})

test('determineS3Region - v1 asset-level storage extension', (t) => {
  const asset = { 'storage:region': 'us-east-1' }
  const item = {}
  t.is(determineS3Region(asset, item), 'us-east-1')
})

test('determineS3Region - v1 item-level storage extension', (t) => {
  const asset = {}
  const item = { properties: { 'storage:region': 'eu-west-1' } }
  t.is(determineS3Region(asset, item), 'eu-west-1')
})

test('determineS3Region - v2 storage extension', (t) => {
  const asset = { 'storage:refs': 'scheme1' }
  const item = {
    'storage:schemes': {
      scheme1: { region: 'ap-southeast-2' }
    }
  }
  t.is(determineS3Region(asset, item), 'ap-southeast-2')
})

test('determineS3Region - default fallback', (t) => {
  const originalRegion = process.env['AWS_REGION']
  delete process.env['AWS_REGION']

  const asset = {}
  const item = {}
  t.is(determineS3Region(asset, item), 'us-west-2')

  if (originalRegion) process.env['AWS_REGION'] = originalRegion
})

test('determineS3Region - environment variable fallback', (t) => {
  const originalRegion = process.env['AWS_REGION']
  process.env['AWS_REGION'] = 'us-west-1'

  const asset = {}
  const item = {}
  t.is(determineS3Region(asset, item), 'us-west-1')

  if (originalRegion) {
    process.env['AWS_REGION'] = originalRegion
  } else {
    delete process.env['AWS_REGION']
  }
})
