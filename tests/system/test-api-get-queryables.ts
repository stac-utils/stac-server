import test from 'ava'
import type { ExecutionContext } from 'ava'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
import { refreshIndices, deleteAllIndices } from '../helpers/database.js'
import { setup } from '../helpers/system-tests.js'
import type { StandUpResult } from '../helpers/system-tests.js'

type TestContext = StandUpResult

test.before(async (t: ExecutionContext<TestContext>) => {
  await deleteAllIndices()
  const standUpResult = await setup()

  t.context = standUpResult

  const collectionId = randomId('collection')

  const collection = await loadFixture(
    'landsat-8-l1-collection.json',
    { id: collectionId }
  )

  await ingestItem({
    ingestQueueUrl: t.context.ingestQueueUrl,
    ingestTopicArn: t.context.ingestTopicArn,
    item: collection
  })
})

test('GET /queryables', async (t: ExecutionContext<TestContext>) => {
  await refreshIndices()

  const proto = randomId()
  const host = randomId()

  const response = await t.context.api.client.get('queryables', {
    resolveBodyOnly: false,
    headers: {
      'X-Forwarded-Proto': proto,
      'X-Forwarded-Host': host
    }
  })

  t.is(response.statusCode, 200)
  t.is(response.headers['content-type'], 'application/schema+json; charset=utf-8')
  t.is(response.body.$id, `${proto}://${host}/queryables`)
  t.is(response.body.title, 'Queryables for STAC API')
  t.is(response.body.$schema, 'https://json-schema.org/draft/2020-12/schema')
  t.is(response.body.type, 'object')
  t.deepEqual(response.body.properties, {})
  t.is(response.body.additionalProperties, true)
})
