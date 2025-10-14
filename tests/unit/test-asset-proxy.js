import test from 'ava'
import {
  parseS3Url,
  proxyAssets,
  shouldProxyAssets,
  determineS3Region,
  isAssetProxyEnabled,
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
  t.is(parseS3Url('s3://bucket-only-no-key'), null)
  t.is(parseS3Url(''), null)
})

test('parseS3Url - handles nested paths', (t) => {
  const result = parseS3Url('s3://my-bucket/deeply/nested/path/to/file.tif')
  t.deepEqual(result, { bucket: 'my-bucket', key: 'deeply/nested/path/to/file.tif', region: null })
})

test('isAssetProxyEnabled - NONE mode', (t) => {
  const originalOption = process.env['ASSET_PROXY_BUCKET_OPTION']
  process.env['ASSET_PROXY_BUCKET_OPTION'] = 'NONE'

  t.false(isAssetProxyEnabled())

  if (originalOption !== undefined) {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = originalOption
  } else {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']
  }
})

test('isAssetProxyEnabled - ALL mode', (t) => {
  const originalOption = process.env['ASSET_PROXY_BUCKET_OPTION']
  process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

  t.true(isAssetProxyEnabled())

  if (originalOption !== undefined) {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = originalOption
  } else {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']
  }
})

test('isAssetProxyEnabled - LIST mode', (t) => {
  const originalOption = process.env['ASSET_PROXY_BUCKET_OPTION']
  process.env['ASSET_PROXY_BUCKET_OPTION'] = 'LIST'

  t.true(isAssetProxyEnabled())

  if (originalOption !== undefined) {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = originalOption
  } else {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']
  }
})

test('shouldProxyAssets - NONE mode returns false', (t) => {
  const originalOption = process.env['ASSET_PROXY_BUCKET_OPTION']
  process.env['ASSET_PROXY_BUCKET_OPTION'] = 'NONE'

  t.false(shouldProxyAssets('any-bucket'))

  if (originalOption !== undefined) {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = originalOption
  } else {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']
  }
})

test('shouldProxyAssets - ALL mode returns true for any bucket', (t) => {
  const originalOption = process.env['ASSET_PROXY_BUCKET_OPTION']
  process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

  t.true(shouldProxyAssets('any-bucket'))
  t.true(shouldProxyAssets('another-bucket'))

  if (originalOption !== undefined) {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = originalOption
  } else {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']
  }
})

test('proxyAssets - ALL mode transforms item assets', (t) => {
  const originalOption = process.env['ASSET_PROXY_BUCKET_OPTION']
  process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

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
    'item1'
  )

  t.true(wasProxied)
  t.is(proxied.thumbnail.href, 'https://api.example.com/collections/collection1/items/item1/assets/thumbnail')
  t.is(proxied.thumbnail.alternate.s3.href, 's3://my-bucket/thumb.jpg')
  t.is(proxied.data.href, 'https://api.example.com/collections/collection1/items/item1/assets/data')
  t.is(proxied.data.alternate.s3.href, 'https://my-bucket.s3.us-west-2.amazonaws.com/data.tif')

  if (originalOption !== undefined) {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = originalOption
  } else {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']
  }
})

test('proxyAssets - NONE mode does not transform assets', (t) => {
  const originalOption = process.env['ASSET_PROXY_BUCKET_OPTION']
  process.env['ASSET_PROXY_BUCKET_OPTION'] = 'NONE'

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
    'item1'
  )

  t.false(wasProxied)
  t.is(proxied.thumbnail.href, 's3://my-bucket/thumb.jpg')
  t.is(proxied.thumbnail.alternate, undefined)

  if (originalOption !== undefined) {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = originalOption
  } else {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']
  }
})

test('proxyAssets - collection assets (no itemId)', (t) => {
  const originalOption = process.env['ASSET_PROXY_BUCKET_OPTION']
  process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

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
    null
  )

  t.true(wasProxied)
  t.is(proxied.thumbnail.href, 'https://api.example.com/collections/collection1/assets/thumbnail')
  t.is(proxied.thumbnail.alternate.s3.href, 's3://my-bucket/collection-thumb.jpg')

  if (originalOption !== undefined) {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = originalOption
  } else {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']
  }
})

test('proxyAssets - preserves existing alternate links', (t) => {
  const originalOption = process.env['ASSET_PROXY_BUCKET_OPTION']
  process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

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
    'item1'
  )

  t.is(proxied.data.alternate.http.href, 'https://example.com/data.tif')
  t.is(proxied.data.alternate.s3.href, 's3://my-bucket/data.tif')

  if (originalOption !== undefined) {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = originalOption
  } else {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']
  }
})

test('proxyAssets - handles non-S3 assets', (t) => {
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
    'item1'
  )

  t.false(wasProxied)
  t.is(proxied.metadata.href, 'https://example.com/metadata.xml')
  t.is(proxied.metadata.alternate, undefined)
})

test('proxyAssets - handles assets without href', (t) => {
  const assets = {
    metadata: {
      type: 'application/xml'
    }
  }

  const { assets: proxied, wasProxied } = proxyAssets(
    assets,
    'https://api.example.com',
    'collection1',
    'item1'
  )

  t.false(wasProxied)
  t.deepEqual(proxied.metadata, { type: 'application/xml' })
})

test('proxyAssets - handles empty assets object', (t) => {
  const assets = {}

  const { assets: proxied, wasProxied } = proxyAssets(
    assets,
    'https://api.example.com',
    'collection1',
    'item1'
  )

  t.false(wasProxied)
  t.deepEqual(proxied, {})
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

test('determineS3Region - v2 storage extension in properties', (t) => {
  const asset = { 'storage:refs': 'scheme1' }
  const item = {
    properties: {
      'storage:schemes': {
        scheme1: { region: 'ap-southeast-2' }
      }
    }
  }
  t.is(determineS3Region(asset, item), 'ap-southeast-2')
})

test('determineS3Region - asset-level takes precedence over item-level', (t) => {
  const asset = { 'storage:region': 'us-east-1' }
  const item = { properties: { 'storage:region': 'eu-west-1' } }
  t.is(determineS3Region(asset, item), 'us-east-1')
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

test('BucketOption - exports expected constants', (t) => {
  t.is(BucketOption.NONE, 'NONE')
  t.is(BucketOption.ALL, 'ALL')
  t.is(BucketOption.ALL_BUCKETS_IN_ACCOUNT, 'ALL_BUCKETS_IN_ACCOUNT')
  t.is(BucketOption.LIST, 'LIST')
})
