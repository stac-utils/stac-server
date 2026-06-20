import anyTest, { type TestFn } from 'ava'
import type { Link } from '../../src/lib/types.js'
import { deleteAllIndices } from '../helpers/database.js'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
import { setup } from '../helpers/system-tests.js'
import type { StandUpResult } from '../helpers/system-tests.js'

type TestContext = StandUpResult & {
  collectionId: string
}

const test = anyTest as TestFn<TestContext>

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await setup()

  t.context = standUpResult as TestContext

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
})

test.beforeEach(async (_) => {
  delete process.env['ENABLE_COLLECTIONS_AUTHX']
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test(
  'GET /collections/:collectionId returns a collection',
  async (t) => {
    const { collectionId } = t.context

    const response = await t.context.api.client.get(`collections/${collectionId}`,
      { resolveBodyOnly: false })

    t.is(response.statusCode, 200)
    t.is(response.headers['content-type'], 'application/json; charset=utf-8')
    t.is(response.body.id, collectionId)

    t.falsy((response as unknown as Record<string, unknown>)['queryables'])

    const qLink = response.body.links.find((l: Link) => l.rel === 'http://www.opengis.net/def/rel/ogc/1.0/queryables')
    t.true(qLink?.href.endsWith(`/collections/${collectionId}/queryables`))

    const aggregateLink = response.body.links.find((l: Link) => l.rel === 'aggregate')
    t.true(aggregateLink?.href.endsWith(`/collections/${collectionId}/aggregate`))

    const aggregationsLink = response.body.links.find((l: Link) => l.rel === 'aggregations')
    t.true(aggregationsLink?.href.endsWith(`/collections/${collectionId}/aggregations`))

    // Check that proper link titles are generated
    response.body.links.forEach((link: Link) => {
      t.truthy(link.hasOwnProperty('title') && link.title)
    })
  }
)

test(
  'GET /collection/:collectionId for non-existent collection returns Not Found',
  async (t) => {
    const response = await t.context.api.client.get(
      'collections/DOES_NOT_EXIST',
      { resolveBodyOnly: false, throwHttpErrors: false }
    )

    t.is(response.statusCode, 404)
  }
)

test(
  'GET /collections/:collectionId with restriction returns filtered collections',
  async (t) => {
    process.env['ENABLE_COLLECTIONS_AUTHX'] = 'true'

    const { collectionId } = t.context

    t.is((await t.context.api.client.get(`collections/${collectionId}`,
      { resolveBodyOnly: false, throwHttpErrors: false })).statusCode, 404)

    t.is((await t.context.api.client.get(`collections/${collectionId}`,
      {
        resolveBodyOnly: false,
        throwHttpErrors: false,
        searchParams: { _collections: '' },
      })).statusCode, 404)

    t.is((await t.context.api.client.get(`collections/${collectionId}`,
      {
        resolveBodyOnly: false,
        searchParams: { _collections: '*' },
      })).statusCode, 200)

    t.is((await t.context.api.client.get(`collections/${collectionId}`,
      {
        resolveBodyOnly: false,
        searchParams: { _collections: `${collectionId},foo,bar` }
      })).statusCode, 200)

    t.is((await t.context.api.client.get(`collections/${collectionId}`,
      {
        resolveBodyOnly: false,
        throwHttpErrors: false,
        searchParams: { _collections: 'not-a-collection' }
      })).statusCode, 404)
  }
)
