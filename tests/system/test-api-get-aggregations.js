// @ts-nocheck

import test from 'ava'
import { randomId } from '../helpers/utils.js'
import { setup } from '../helpers/system-tests.js'

test.before(async (t) => {
  t.context = await setup()
})

test('GET /aggregations', async (t) => {
  const proto = randomId()
  const host = randomId()

  const response = await t.context.api.client.get(
    'aggregations',
    {
      resolveBodyOnly: false,
      headers: {
        'X-Forwarded-Proto': proto,
        'X-Forwarded-Host': host
      }
    }
  )

  t.is(response.statusCode, 200)
  t.is(response.headers['content-type'], 'application/json; charset=utf-8')
  t.deepEqual(response.body.aggregations, [
    {
      name: 'total_count',
      data_type: 'integer'
    },
    {
      name: 'datetime_max',
      data_type: 'datetime'
    },
    {
      name: 'datetime_min',
      data_type: 'datetime'
    },
    {
      name: 'datetime_frequency',
      data_type: 'frequency_distribution',
      frequency_distribution_data_type: 'datetime'
    },
  ])
  t.deepEqual(response.body.links, [
    {
      rel: 'root',
      type: 'application/json',
      href: `${proto}://${host}`
    },
    {
      rel: 'self',
      type: 'application/json',
      href: `${proto}://${host}/aggregations`
    }
  ])
})
