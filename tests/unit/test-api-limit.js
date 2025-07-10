// @ts-nocheck

import test from 'ava'
import { extractLimit } from '../../src/lib/api.js'
import { ValidationError } from '../../src/lib/errors.js'

test.beforeEach(() => {
  delete process.env['ITEMS_MAX_LIMIT']
})

test('extractLimit undefined', (t) => {
  t.falsy(extractLimit({}), 'Returns undefined when no limit parameter')
})

test('extractLimit when set', (t) => {
  t.is(extractLimit({ limit: '1' }), 1)
})

test('extractLimit when over max limit', (t) => {
  t.is(extractLimit({ limit: '10001' }), 10000)
})

test('extractLimit when over max limit and ITEMS_MAX_LIMIT set', (t) => {
  process.env['ITEMS_MAX_LIMIT'] = '100'
  t.is(extractLimit({ limit: '8374' }), 100)
})

test('extractLimit when over max limit and ITEMS_MAX_LIMIT set over absolute max limit', (t) => {
  process.env['ITEMS_MAX_LIMIT'] = '10001'
  t.is(extractLimit({ limit: '10002' }), 10000)
})

test('extractLimit invalid values', (t) => {
  const invalidLimits = ['', '-1', '0', 'a', -1, 0]

  for (const limit of invalidLimits) {
    t.throws(() => {
      extractLimit({ limit })
    }, { instanceOf: ValidationError }, `limit parsing of ${limit}`)
  }
})
