const test = require('ava')
const { deleteAllIndices } = require('../helpers/es')
const { randomId } = require('../helpers/utils')
const { startApi } = require('../helpers/api')
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

test('GET / returns links with the correct endpoint when the API was started with STAC_API_URL set', async (t) => {
  const before = { ...process.env }
  let api
  try {
    const url = `http://${randomId()}.local`

    process.env['STAC_API_URL'] = url

    api = await startApi()

    const response = await api.client.get('')

    const apiLink = response.links.find((l) => l.rel === 'service-desc')

    t.not(apiLink, undefined)
    t.is(apiLink.href, `${url}/api`)
  } finally {
    await api.close()
    process.env = before
  }
})

test('GET / returns links with the correct endpoint if `X-Forwarded-Proto` and `X-Forwarded-Host` are set', async (t) => {
  const proto = randomId()
  const host = randomId()

  const response = await t.context.api.client.get('', {
    headers: {
      'X-Forwarded-Proto': proto,
      'X-Forwarded-Host': host
    }
  })

  const apiLink = response.links.find((l) => l.rel === 'service-desc')

  t.not(apiLink, undefined)
  t.is(apiLink.href, `${proto}://${host}/api`)
})

test.only('GET / returns links with the correct endpoint if `X-STAC-Endpoint` is set', async (t) => {
  const url = `http://${randomId()}.local`

  const response = await t.context.api.client.get('', {
    headers: {
      'X-STAC-Endpoint': url
    }
  })

  const apiLink = response.links.find((l) => l.rel === 'service-desc')

  t.not(apiLink, undefined)
  t.is(apiLink.href, `${url}/api`)
})
