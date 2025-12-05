// @ts-nocheck

import test from 'ava'
import { mockClient } from 'aws-sdk-client-mock'
import { S3Client } from '@aws-sdk/client-s3'
import { AssetProxy, ALTERNATE_ASSETS_EXTENSION } from '../../src/lib/asset-proxy.js'

const s3Mock = mockClient(S3Client)

test.beforeEach(() => {
  s3Mock.reset()
})

test('AssetProxy - constructor initializes with expected defaults', async (t) => {
  const before = { ...process.env }
  try {
    delete process.env['ASSET_PROXY_BUCKET_OPTION']

    const proxy = await AssetProxy.create()
    t.is(proxy.urlExpiry, 300)
    t.is(proxy.isEnabled, false)
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
