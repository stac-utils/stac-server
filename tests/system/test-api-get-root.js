const test = require('ava')
const { deleteAllIndices } = require('../helpers/es')
const systemTests = require('../helpers/system-tests')

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await systemTests.setup()

  t.context = standUpResult
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

test('GET / includes the default links', async (t) => {
  const response = await t.context.api.client.get('')

  t.true(Array.isArray(response.links))

  const defaultLinkRels = [
    'conformance',
    'data',
    'search',
    'self',
    'service-desc'
  ]

  t.true(response.links.length >= defaultLinkRels.length)

  // @ts-expect-error We need to type the response
  const responseRels = response.links.map((r) => r.rel)

  for (const expectedRel of defaultLinkRels) {
    t.true(responseRels.includes(expectedRel))
  }
})

test('GET / returns a compressed response', async (t) => {
  const response = await t.context.api.client.get('', { resolveBodyOnly: false })

  t.is(response.headers['content-encoding'], 'gzip')
})
