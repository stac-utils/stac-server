const test = require('ava')
const es = require('../../src/lib/es')

test('search id parameter doesnt override other parameters', async (t) => {
  const ids = 'a,b,c'
  const range = '2007-03-01T13:00:00Z/2008-05-11T15:30:00Z'
  const queryParams = {
    ids: ids,
    datetime: range
  }
  const searchBody = await es.constructSearchParams(queryParams, 1)

  // TODO: the ordering here is fragile. helper methods needed to ensure the queries are correct
  t.is(
    searchBody.body.query.constant_score.filter.bool.must[0].terms.id,
    ids,
    'query contains id filter'
  )
  t.assert(
    searchBody.body.query.constant_score.filter.bool.must[1].range['properties.datetime'],
    'query contains datetime filter'
  )
})

/* eslint max-len: 0 */
test('search datetime parameter intervals are correctly parsed', async (t) => {
  const datetimes = [
    ['1985-04-12T23:20:50.52-01:00/1986-04-12T23:20:50.52-01:00', '1985-04-12T23:20:50.52-01:00', '1986-04-12T23:20:50.52-01:00'],
    ['../1985-04-12T23:20:50.52Z', undefined, '1985-04-12T23:20:50.52Z'],
    ['1985-04-12T23:20:50.52Z/..', '1985-04-12T23:20:50.52Z', undefined],
    ['1985-04-12T23:20:50.52Z/', '1985-04-12T23:20:50.52Z', undefined],
    ['../1985-04-12T23:20:50.52Z', undefined, '1985-04-12T23:20:50.52Z'],
    ['/1985-04-12T23:20:50.52Z', undefined, '1985-04-12T23:20:50.52Z'],
    ['1985-04-12T23:20:50.52Z/1986-04-12T23:20:50.52Z', '1985-04-12T23:20:50.52Z', '1986-04-12T23:20:50.52Z'],
    ['1985-04-12T23:20:50.52+01:00/1986-04-12T23:20:50.52+01:00', '1985-04-12T23:20:50.52+01:00', '1986-04-12T23:20:50.52+01:00'],
    ['1985-04-12T23:20:50.52-01:00/1986-04-12T23:20:50.52-01:00', '1985-04-12T23:20:50.52-01:00', '1986-04-12T23:20:50.52-01:00']
  ]

  await datetimes.map(async ([datetime, start, end]) => {
    const dtQuery = await es.buildDatetimeQuery({ datetime: datetime })
    t.is(dtQuery.range['properties.datetime'].gte, start, 'datetime interval start')
    t.is(dtQuery.range['properties.datetime'].lte, end, 'datetime interval end')
  })
})

test('search datetime parameter instants are correctly parsed', async (t) => {
  const validDatetimes = [
    '1985-04-12T23:20:50.52Z',
    '1996-12-19T16:39:57-00:00',
    '1996-12-19T16:39:57+00:00',
    '1996-12-19T16:39:57-08:00',
    '1996-12-19T16:39:57+08:00',
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
    '1985-04-12' // date only is not required by STAC, but accepted here
  ]

  await validDatetimes.map(async (datetime) => {
    const dtQuery = await es.buildDatetimeQuery({ datetime: datetime })
    t.is(dtQuery.term['properties.datetime'], datetime, 'datetime instant parses correctly')
  })
})
