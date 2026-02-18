// @ts-nocheck

import test from 'ava'
import { deleteAllIndices } from '../helpers/database.js'
import { randomId } from '../helpers/utils.js'
import { setup } from '../helpers/system-tests.js'

test.before(async (t) => {
  await deleteAllIndices()

  t.context = await setup()
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('POST /collections creates a collection', async (t) => {
  const collectionId = randomId('collection')

  const response = await t.context.api.client.post('collections',
    { json: { id: collectionId }, resolveBodyOnly: false, responseType: 'text' })

  t.is(response.statusCode, 201)
  t.is(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.is(response.body, 'Created')

  // ES needs a second to process the create request
  // eslint-disable-next-line no-promise-executor-return
  await new Promise((r) => setTimeout(r, 1000))

  const response2 = await t.context.api.client.get(`collections/${collectionId}`,
    { resolveBodyOnly: false })

  t.is(response2.statusCode, 200)
  t.is(response2.headers['content-type'], 'application/json; charset=utf-8')
  // @ts-expect-error We need to validate these responses
  t.is(response2.body.id, collectionId)
})

test('POST /collections index hasing allows creation of collections with same name but different case', async (t) => {
  const collectionIdOne = 'TestCollection'
  const response = await t.context.api.client.post('collections', { json: { id: collectionIdOne }, resolveBodyOnly: false, responseType: 'text' })

  // ES needs a second to process the create request
  // eslint-disable-next-line no-promise-executor-return
  await new Promise((r) => setTimeout(r, 1000))

  t.is(response.statusCode, 201)
  t.is(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.is(response.body, 'Created')

  const collectionIdTwo = 'testcollection'
  const response2 = await t.context.api.client.post('collections', { json: { id: collectionIdTwo }, resolveBodyOnly: false, responseType: 'text' })

  // ES needs a second to process the create request
  // eslint-disable-next-line no-promise-executor-return
  await new Promise((r) => setTimeout(r, 1000))

  t.is(response2.statusCode, 201)
  t.is(response2.headers['content-type'], 'text/plain; charset=utf-8')
  t.is(response2.body, 'Created')

  // check for collection existance of both to ensure there was no overwriting
  const response3 = await t.context.api.client.get(`collections/${collectionIdOne}`,
    { resolveBodyOnly: false })

  t.is(response3.statusCode, 200)
  t.is(response3.headers['content-type'], 'application/json; charset=utf-8')
  t.is(response3.body.id, collectionIdOne)

  const response4 = await t.context.api.client.get(`collections/${collectionIdTwo}`,
    { resolveBodyOnly: false })

  t.is(response4.statusCode, 200)
  t.is(response4.headers['content-type'], 'application/json; charset=utf-8')
  t.is(response4.body.id, collectionIdTwo)
})
