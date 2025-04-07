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
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET /collections/:collectionId/queryables returns queryables', async (t) => {
  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: t.context.collectionId }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: collection
  })

  const { collectionId } = t.context

  const response = await t.context.api.client.get(`collections/${collectionId}/queryables`,
    { resolveBodyOnly: false })

  t.is(response.statusCode, 200)
  t.is(response.headers['content-type'], 'application/schema+json; charset=utf-8')
  // @ts-expect-error We need to validate these responses
  t.true(response.body.$id.endsWith(`/collections/${collectionId}/queryables`))
  t.is(response.body.title, `Queryables for Collection ${collectionId}`)
  t.is(response.body.$schema, 'https://json-schema.org/draft/2020-12/schema')
  t.is(response.body.type, 'object')
  t.deepEqual(response.body.properties, {
    'eo:cloud_cover': {
      $ref: 'https://stac-extensions.github.io/eo/v1.0.0/schema.json#/definitions/fields/properties/eo:cloud_cover',
    },
  })
  t.is(response.body.additionalProperties, true)
})

test('GET /collections/:collectionId/queryables returns queryables even if not defined in Collection', async (t) => {
  const collection = await loadFixture(
    'stac/collection-without-queryables.json',
    { id: t.context.collectionId }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: collection
  })

  const { collectionId } = t.context

  const response = await t.context.api.client.get(`collections/${collectionId}/queryables`,
    { resolveBodyOnly: false })

  t.is(response.statusCode, 200)
  t.is(response.headers['content-type'], 'application/schema+json; charset=utf-8')
  // @ts-expect-error We need to validate these responses
  t.true(response.body.$id.endsWith(`/collections/${collectionId}/queryables`))
  t.is(response.body.title, `Queryables for Collection ${collectionId}`)
  t.is(response.body.$schema, 'https://json-schema.org/draft/2020-12/schema')
  t.is(response.body.type, 'object')
  t.deepEqual(response.body.properties, {})
  t.is(response.body.additionalProperties, true)
})

test('GET /collection/:collectionId/queryables for non-existent collection returns Not Found', async (t) => {
  const response = await t.context.api.client.get(
    'collections/DOES_NOT_EXIST/queryables',
    { resolveBodyOnly: false, throwHttpErrors: false }
  )

  t.is(response.statusCode, 404)
})

test.only('GET /collection/:collectionId/queryables for collection with unsupported queryables fails', async (t) => {
  const collection = await loadFixture(
    'stac/collection-with-incorrect-queryables.json',
    { id: t.context.collectionId }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: collection
  })

  const { collectionId } = t.context

  const error = await t.throwsAsync(
    async () => t.context.api.client.get(`collections/${collectionId}/queryables`,
      { resolveBodyOnly: false })
  )

  t.is(error.response.statusCode, 400)
  t.regex(error.response.body.description,
    /.*Unsupported additionalProperties value: "false". Must be set to "true".*/)
})

test('GET /collections/:collectionId/queryables with restriction returns filtered collections', async (t) => {
  process.env['ENABLE_COLLECTIONS_AUTHX'] = 'true'

  const { collectionId } = t.context

  const path = `collections/${collectionId}/queryables`

  t.is((await t.context.api.client.get(path,
    { resolveBodyOnly: false })).statusCode, 200)

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
