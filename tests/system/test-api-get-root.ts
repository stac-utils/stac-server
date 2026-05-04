import anyTest, { type TestFn } from 'ava'
import type { Link } from '../../src/lib/types.js'
import { deleteAllIndices } from '../helpers/database.js'
import { randomId } from '../helpers/utils.js'
import { startApi } from '../helpers/api.js'
import { setup } from '../helpers/system-tests.js'
import type { StandUpResult } from '../helpers/system-tests.js'

type TestContext = StandUpResult

const test = anyTest as TestFn<TestContext>

test.before(async (t) => {
  await deleteAllIndices()
  const standUpResult = await setup()

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

  const responseRels = response.links.map((r: Link) => r.rel)

  for (const expectedRel of defaultLinkRels) {
    t.true(responseRels.includes(expectedRel))
  }
})

test(
  'GET / returns links with the correct endpoint when the API was started with STAC_API_URL set',
  async (t) => {
    const before = { ...process.env }
    let api
    try {
      const url = `http://${randomId()}.local`

      process.env['STAC_API_URL'] = url

      api = await startApi()

      const response = await api.client.get('')

      const apiLink = response.links.find((l: Link) => l.rel === 'service-desc')

      t.not(apiLink, undefined)
      t.is(apiLink.href, `${url}/api`)
    } finally {
      await api.close()
      process.env = before
    }
  }
)

test(
  'GET / returns links with the correct endpoint if `X-Forwarded-Proto` and `X-Forwarded-Host` are set',
  async (t) => {
    const proto = randomId()
    const host = randomId()

    const response = await t.context.api.client.get('', {
      headers: {
        'X-Forwarded-Proto': proto,
        'X-Forwarded-Host': host
      }
    })

    const linkRels = new Map([
      ['service-desc', '/api'],
      ['http://www.opengis.net/def/rel/ogc/1.0/queryables', '/queryables'],
      ['aggregate', '/aggregate'],
      ['aggregations', '/aggregations'],
    ])

    for (const [rel, hrefSuffix] of linkRels) {
      t.is(response.links.find((l: Link) => l.rel === rel)?.href, `${proto}://${host}${hrefSuffix}`)
    }
  }
)

test(
  'GET / returns links with the correct endpoint if `X-STAC-Endpoint` is set',
  async (t) => {
    const url = `http://${randomId()}.local`

    const response = await t.context.api.client.get('', {
      headers: {
        'X-STAC-Endpoint': url
      }
    })

    const apiLink = response.links.find((l: Link) => l.rel === 'service-desc')

    t.not(apiLink, undefined)
    t.is(apiLink.href, `${url}/api`)
  }
)

test(
  'GET / returns links with the correct endpoint if `STAC-Endpoint` is set',
  async (t) => {
    const url = `http://${randomId()}.local`

    const response = await t.context.api.client.get('', {
      headers: {
        'STAC-Endpoint': url
      }
    })

    const apiLink = response.links.find((l: Link) => l.rel === 'service-desc')

    t.not(apiLink, undefined)
    t.is(apiLink.href, `${url}/api`)
  }
)

test(
  'GET / returns a compressed response if ENABLE_RESPONSE_COMPRESSION',
  async (t) => {
    const response = await t.context.api.client.get('', { resolveBodyOnly: false })

    if (process.env['ENABLE_RESPONSE_COMPRESSION'] !== 'false') {
      t.is(response.headers['content-encoding'], 'br')
    } else {
      t.true(response.headers['content-encoding'] === undefined)
    }
  }
)
