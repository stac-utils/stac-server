// @ts-nocheck

import test from 'ava'
import { extractLimit } from '../../src/lib/api.js'
import { ValidationError } from '../../src/lib/errors.js'

test('extractLimit undefined', (t) => {
  t.falsy(extractLimit({}), 'Returns undefined when no limit parameter')
})

test('extractLimit when set', (t) => {
  t.is(extractLimit({ limit: '1' }), 1)
})

test('extractLimit when over max limit', (t) => {
  t.is(extractLimit({ limit: '10001' }), 10000)
})

test('extractLimit invalid values', (t) => {
  const invalidLimits = ['', '-1', '0', 'a', -1, 0]

  for (const limit of invalidLimits) {
    t.throws(() => {
      extractLimit({ limit })
    }, { instanceOf: ValidationError }, `limit parsing of ${limit}`)
  }
})
