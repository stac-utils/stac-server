// @ts-nocheck

import test from 'ava'
import { deleteAllIndices, refreshIndices } from '../helpers/database.js'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
import { setup, loadJson } from '../helpers/system-tests.js'
import { processMessages } from '../../src/lib/ingest.js'

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

  t.context.itemId1 = randomId('item')

  const item1 = await loadFixture(
    'stac/LC80100102015082LGN00.json',
    {
      id: t.context.itemId1,
      collection: t.context.collectionId
    }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: item1
  })

  t.context.itemId2 = randomId('item')

  const item2 = await loadFixture(
    'stac/LC80100102015050LGN00.json',
    {
      id: t.context.itemId2,
      collection: t.context.collectionId
    }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: item2
  })
})

test.beforeEach(async (_) => {
  delete process.env['ENABLE_COLLECTIONS_AUTHX']
  delete process.env['ENABLE_FILTER_AUTHX']
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET /collections/:collectionId/items', async (t) => {
  const { collectionId, itemId1, itemId2 } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}/items`,
    { resolveBodyOnly: false }
  )

  t.is(response.statusCode, 200)
  t.is(response.headers['content-type'], 'application/geo+json; charset=utf-8')

  t.is(response.body.type, 'FeatureCollection')

  t.is(response.body.features.length, 2)

  t.is(response.body.features[0].id, itemId1)
  t.is(response.body.features[1].id, itemId2)
})

test('GET /collections/:collectionId/items for non-existent collection returns 404', async (t) => {
  const { collectionId } = t.context

  const response = await t.context.api.client.get(
    `collections/${collectionId}_DOES_NOT_EXIST/items`,
    { resolveBodyOnly: false, throwHttpErrors: false }
  )

  t.is(response.statusCode, 404)
})

test('GET /collections/:collectionId/items with restriction returns filtered collections', async (t) => {
  const { collectionId } = t.context
  process.env['ENABLE_COLLECTIONS_AUTHX'] = 'true'

  const path = `collections/${collectionId}/items`

  // _collections undefined
  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false, throwHttpErrors: false })).statusCode, 404)

  // _collections empty
  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false,
      throwHttpErrors: false,
      searchParams: { _collections: '' },
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
})

test('GET /collections/:collectionId/items with filter restriction', async (t) => {
  process.env['ENABLE_FILTER_AUTHX'] = 'true'

  const fixtureFiles = [
    'collection.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ]
  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))
  await processMessages(items)
  await refreshIndices()

  const collectionId = 'landsat-8-l1'
  const urlpath = `collections/${collectionId}/items`

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: { }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 2)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: { _filter: null }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 2)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: { _filter: JSON.stringify({
          op: '=',
          args: [
            { property: 'id' }, 'foobar'
          ]
        }) }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '<>',
            args: [
              { property: 'id' }, 'LC80100102015050LGN00'
            ]
          })
        } })
    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 1)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'landsat:scene_id' }, 'LC80100102015050LGN00'
            ]
          })
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 1)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'landsat:scene_id' }, 'foo'
            ]
          })
        } })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'id' }, 'LC80100102015050LGN00'
            ]
          }),
          filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'id' }, 'LC80100102015082LGN00'
            ]
          })
        }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 0)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        searchParams: {
          _filter: JSON.stringify({
            op: '=',
            args: [
              { property: 'id' }, 'LC80100102015050LGN00'
            ]
          }),
          filter: JSON.stringify({
            op: '<>',
            args: [
              { property: 'id' }, 'LC80100102015082LGN00'
            ]
          })
        }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 1)
  }

  {
    const r = await t.context.api.client.get(urlpath,
      { resolveBodyOnly: false,
        headers: { 'stac-filter-authx': JSON.stringify({
          op: '=',
          args: [
            { property: 'id' }, 'LC80100102015050LGN00'
          ]
        }) },
        searchParams: {
          filter: JSON.stringify({
            op: '<>',
            args: [
              { property: 'id' }, 'LC80100102015082LGN00'
            ]
          })
        }
      })

    t.is(r.statusCode, 200)
    t.is(r.body.features.length, 1)
  }
})
