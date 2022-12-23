// @ts-nocheck

const test = require('ava')
const { deleteAllIndices } = require('../helpers/database')
const { randomId } = require('../helpers/utils')
const systemTests = require('../helpers/system-tests')

test.before(async (t) => {
  await deleteAllIndices()

  t.context = await systemTests.setup()
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
