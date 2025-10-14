// @ts-nocheck

import test from 'ava'
import { deleteAllIndices } from '../helpers/database.js'
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

  t.context.itemId = randomId('item')

  const item = await loadFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: t.context.itemId,
      collection: t.context.collectionId
    }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item
  })
})

test.beforeEach(async (_) => {
  delete process.env['ENABLE_COLLECTIONS_AUTHX']
  delete process.env['ENABLE_FILTER_AUTHX']
  delete process.env['ENABLE_THUMBNAILS']
  delete process.env['ASSET_PROXY_BUCKET_OPTION']
  delete process.env['ASSET_PROXY_BUCKET_LIST']
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET /collections/:collectionId/items/:itemId', async (t) => {
  const { collectionId, itemId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`,
    { resolveBodyOnly: false }
  )

  t.is(response.statusCode, 200)
  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')
  t.is(response.body.type, 'Feature')
  t.is(response.body.id, itemId)
  t.is(response.body.collection, collectionId)
})

test('GET /collections/:collectionId/items/:itemId for a non-existent id returns not found', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items/DOES_NOT_EXIST`,
    { resolveBodyOnly: false, throwHttpErrors: false }
  )

  t.is(response.statusCode, 404)
})

test('GET /collections/:collectionId/items/:itemId for a non-existent collection returns not found', async (t) => {
  const response = await t.context.api.client.get(
    'collections/DOES_NOT_EXIST/items/DOES_NOT_EXIST',
    { resolveBodyOnly: false, throwHttpErrors: false }
  )

  t.is(response.statusCode, 404)
})

test('GET /collections/:collectionId/items/:itemId with restriction returns filtered collections', async (t) => {
  process.env['ENABLE_COLLECTIONS_AUTHX'] = 'true'

  const { collectionId, itemId } = t.context

  const path = `collections/${collectionId}/items/${itemId}`

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false, throwHttpErrors: false })).statusCode, 404)

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false,
      throwHttpErrors: false,
      searchParams: { _collections: '' }
    })).statusCode, 404)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      searchParams: { _collections: '*' }
    })).statusCode, 200)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      searchParams: { _collections: `${collectionId},foo,bar` }
    })).statusCode, 200)

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false,
      throwHttpErrors: false,
      searchParams: { _collections: 'not-a-collection' }
    })).statusCode, 404)

  // header
  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      headers: { 'stac-collections-authx': `${collectionId},foo,bar` }
    })).statusCode, 200)
})

test('GET /collections/:collectionId/items/:itemId/thumbnail with restriction returns filtered collections', async (t) => {
  process.env['ENABLE_COLLECTIONS_AUTHX'] = 'true'
  process.env['ENABLE_THUMBNAILS'] = 'true'

  const { collectionId, itemId } = t.context

  const path = `collections/${collectionId}/items/${itemId}/thumbnail`

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false, throwHttpErrors: false
    })).statusCode, 404)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      throwHttpErrors: false,
      searchParams: { _collections: '' }
    })).statusCode, 404)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      followRedirect: false,
      searchParams: { _collections: '*' }
    })).statusCode, 302)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      followRedirect: false,
      searchParams: { _collections: `${collectionId},foo,bar` }
    })).statusCode, 302)

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false,
      followRedirect: false,
      throwHttpErrors: false,
      searchParams: { _collections: 'not-a-collection' }
    })).statusCode, 404)

  // header
  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      followRedirect: false,
      headers: { 'stac-collections-authx': `${collectionId},foo,bar` }
    })).statusCode, 302)
})

test('GET /collections/:collectionId/items/:itemId/thumbnail disabled', async (t) => {
  process.env['ENABLE_THUMBNAILS'] = 'false'

  const { collectionId, itemId } = t.context

  const path = `collections/${collectionId}/items/${itemId}/thumbnail`

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false, throwHttpErrors: false })).statusCode, 404)
})

test('GET /collections/:collectionId/items/:itemId with filter authx returns filtered collections', async (t) => {
  process.env['ENABLE_FILTER_AUTHX'] = 'true'

  const { collectionId, itemId } = t.context

  const path = `collections/${collectionId}/items/${itemId}`

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
    })).statusCode, 200)

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false,
      searchParams: { _filter: null }
    })).statusCode, 200)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      throwHttpErrors: false,
      searchParams: { _filter: JSON.stringify({
        op: '=',
        args: [
          { property: 'id' }, 'itemId'
        ]
      }) }
    })).statusCode, 404)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      throwHttpErrors: false,
      searchParams: { _filter: JSON.stringify({
        op: '=',
        args: [
          { property: 'id' }, 'foobar'
        ]
      }) }
    })).statusCode, 404)
})

test('GET /collections/:collectionId/items/:itemId/thumbnail with filter authx returns filtered results', async (t) => {
  process.env['ENABLE_FILTER_AUTHX'] = 'true'
  process.env['ENABLE_THUMBNAILS'] = 'true'

  const { collectionId, itemId } = t.context

  const path = `collections/${collectionId}/items/${itemId}/thumbnail`

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false, throwHttpErrors: false, followRedirect: false,
    })).statusCode, 302)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      throwHttpErrors: false,
      followRedirect: false,
      searchParams: { _filter: '' }
    })).statusCode, 302)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      followRedirect: false,
      throwHttpErrors: false,
      searchParams: { _filter: JSON.stringify({
        op: '<>',
        args: [
          { property: 'id' }, itemId
        ]
      }) }
    })).statusCode, 404)

  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      followRedirect: false,
      searchParams: { _filter: JSON.stringify({
        op: '=',
        args: [
          { property: 'id' }, itemId
        ]
      }) }
    })).statusCode, 302)

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false,
      followRedirect: false,
      throwHttpErrors: false,
      searchParams: { _filter: JSON.stringify({
        op: '=',
        args: [
          { property: 'id' }, 'non-existent'
        ]
      }) }
    })).statusCode, 404)

  // header
  t.is((await t.context.api.client.get(path,
    {
      resolveBodyOnly: false,
      followRedirect: false,
      throwHttpErrors: false,
      headers: { 'stac-filter-authx': JSON.stringify({
        op: '=',
        args: [
          { property: 'id' }, itemId
        ]
      }) }
    })).statusCode, 302)
})

test.serial('GET /collections/:collectionId/items/:itemId with asset proxying transforms assets', async (t) => {
  process.env['ASSET_PROXY_BUCKET_OPTION'] = 'ALL'

  const { collectionId, itemId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items/${itemId}`,
    { resolveBodyOnly: false }
  )

  t.is(response.statusCode, 200)

  const { assets } = response.body
  t.truthy(assets.B1)

  const b1Asset = assets.B1
  t.true(b1Asset.href.includes(`/collections/${collectionId}/items/${itemId}/assets/B1`))
  t.truthy(b1Asset.alternate)
  t.truthy(b1Asset.alternate.s3)
  t.true(b1Asset.alternate.s3.href.includes('landsat-pds'))
})
