// @ts-nocheck

import test from 'ava'
import { extractDatetime } from '../../src/lib/api.js'
import { ValidationError } from '../../src/lib/errors.js'

const validDatetimes = [
  '1985-04-12T23:20:50.52Z',
  '1996-12-19T16:39:57-00:00',
  '1996-12-19T16:39:57+00:00',
  '1996-12-19T16:39:57-08:00',
  '1996-12-19T16:39:57+08:00',
  '../1985-04-12T23:20:50.52Z',
  '1985-04-12T23:20:50.52Z/..',
  '/1985-04-12T23:20:50.52Z',
  '1985-04-12T23:20:50.52Z/',
  '1985-04-12T23:20:50.52Z/1986-04-12T23:20:50.52Z',
  '1985-04-12T23:20:50.52+01:00/1986-04-12T23:20:50.52+01:00',
  '1985-04-12T23:20:50.52-01:00/1986-04-12T23:20:50.52-01:00',
  '1937-01-01T12:00:27.87+01:00',
  '1985-04-12T23:20:50.52Z',
  '1937-01-01T12:00:27.8710+01:00',
  '1937-01-01T12:00:27.8+01:00',
  '1937-01-01T12:00:27.8Z',
  '2020-07-23T00:00:00.000+03:00',
  '2020-07-23T00:00:00+03:00',
  '1985-04-12t23:20:50.000z',
  '2020-07-23T00:00:00Z',
  '2020-07-23T00:00:00.0Z',
  '2020-07-23T00:00:00.01Z',
  '2020-07-23T00:00:00.012Z',
  '2020-07-23T00:00:00.0123Z',
  '2020-07-23T00:00:00.01234Z',
  '2020-07-23T00:00:00.012345Z',
  '2020-07-23T00:00:00.0123456Z',
  '2020-07-23T00:00:00.01234567Z',
  '2020-07-23T00:00:00.012345678Z',
]

const invalidDatetimes = [
  '/',
  '../..',
  '/..',
  '../',
  '/1984-04-12T23:20:50.52Z/1985-04-12T23:20:50.52Z',
  '1984-04-12T23:20:50.52Z/1985-04-12T23:20:50.52Z/',
  '/1984-04-12T23:20:50.52Z/1985-04-12T23:20:50.52Z/',
  '1985-04-12', // date only
  '1937-01-01T12:00:27.87+0100', // invalid TZ format, no sep :
  '37-01-01T12:00:27.87Z', // invalid year, must be 4 digits
  '1985-12-12T23:20:50.52', // no TZ
  '21985-12-12T23:20:50.52Z', // year must be 4 digits
  '1985-13-12T23:20:50.52Z', // month > 12
  '1985-12-32T23:20:50.52Z', // day > 31
  '1985-12-01T25:20:50.52Z', // hour > 24
  '1985-12-01T00:60:50.52Z', // minute > 59
  '1985-12-01T00:06:61.52Z', // second > 60
  '1985-04-12T23:20:50.Z', // fractional sec . but no frac secs
  '1985-04-12T23:20:50,Z', // fractional sec , but no frac secs
  '1990-12-31T23:59:61Z', // second > 60 w/o fractional seconds
  '1986-04-12T23:20:50.52Z/1985-04-12T23:20:50.52Z',
  '1985-04-12T23:20:50,52Z', // comma as frac sec sep allowed in ISO8601 but not RFC3339
]

test('extractBboxNull', (t) => {
  t.falsy(extractDatetime({}),
    'Returns undefined when no datetime parameter')
})

test('extractDatetime valid datetime values', (t) => {
  for (const datetime of validDatetimes) {
    t.is(extractDatetime({ datetime }), datetime.toUpperCase())
  }
})

test('extractDatetime invalid datetime values', (t) => {
  for (const datetime of invalidDatetimes) {
    t.throws(() => {
      extractDatetime({ datetime })
    }, { instanceOf: ValidationError })
  }
})
