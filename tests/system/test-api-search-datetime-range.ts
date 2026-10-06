import anyTest, { type TestFn } from 'ava'
import { deleteAllIndices, refreshIndices } from '../helpers/database.js'
import { processMessages } from '../../src/lib/ingest.js'
import { loadJson, setup } from '../helpers/system-tests.js'
import type { StandUpResult } from '../helpers/system-tests.js'
import type { StacItem } from '../../src/lib/types.js'

type TestContext = StandUpResult
const test = anyTest as TestFn<TestContext>

// Two items with only a datetime (2015-02-19 and 2015-03-23), plus two items
// covering 2015-03-07 to 2015-03-14: one with a null datetime and one with a
// nominal datetime inside the range.
const INSTANT_FEB = 'LC80100102015050LGN00'
const INSTANT_MAR = 'LC80100102015082LGN00'
const RANGE_ONLY = 'range-only'
const RANGE_NOMINAL = 'range-nominal'

const rangeItem = async (id: string, datetime: string | null) => {
  const item = await loadJson('LC80100102015050LGN00.json') as StacItem
  item.id = id
  item.properties.datetime = datetime
  item.properties.start_datetime = '2015-03-07T00:00:00Z'
  item.properties.end_datetime = '2015-03-14T00:00:00Z'
  return item
}

test.before(async (t) => {
  await deleteAllIndices()
  t.context = await setup()

  await processMessages([await loadJson('collection.json')])
  await refreshIndices()
  await processMessages([
    await loadJson(`${INSTANT_FEB}.json`),
    await loadJson(`${INSTANT_MAR}.json`),
    await rangeItem(RANGE_ONLY, null),
    await rangeItem(RANGE_NOMINAL, '2015-03-10T12:00:00Z')
  ])
  await refreshIndices()
})

test.after.always(async (t) => {
  if (t.context.api) await t.context.api.close()
})

const cases: [string, string, string[]][] = [
  ['covers everything', '2015-02-01T00:00:00Z/2015-03-31T00:00:00Z',
    [INSTANT_FEB, INSTANT_MAR, RANGE_ONLY, RANGE_NOMINAL]],
  ['overlaps start of range', '2015-02-01T00:00:00Z/2015-03-08T00:00:00Z',
    [INSTANT_FEB, RANGE_ONLY, RANGE_NOMINAL]],
  ['overlaps end of range', '2015-03-13T00:00:00Z/2015-03-31T00:00:00Z',
    [INSTANT_MAR, RANGE_ONLY, RANGE_NOMINAL]],
  ['inside range', '2015-03-08T00:00:00Z/2015-03-09T00:00:00Z',
    [RANGE_ONLY, RANGE_NOMINAL]],
  ['open start', '../2015-03-08T00:00:00Z',
    [INSTANT_FEB, RANGE_ONLY, RANGE_NOMINAL]],
  ['open end', '2015-03-13T00:00:00Z/..',
    [INSTANT_MAR, RANGE_ONLY, RANGE_NOMINAL]],
  ['instant inside range', '2015-03-09T00:00:00Z',
    [RANGE_ONLY, RANGE_NOMINAL]],
  ['instant matching a datetime', '2015-02-19T15:06:12.565047Z',
    [INSTANT_FEB]],
  ['between items', '2015-02-20T00:00:00Z/2015-03-01T00:00:00Z',
    []],
  ['after range', '2015-03-15T00:00:00Z/2015-03-20T00:00:00Z',
    []]
]

for (const [name, datetime, expected] of cases) {
  test(`/search datetime ${name}`, async (t) => {
    const response = await t.context.api.client.post('search', {
      json: { collections: ['landsat-8-l1'], datetime }
    })
    const ids = response.features.map((item: StacItem) => item.id).sort()
    t.deepEqual(ids, [...expected].sort())
  })
}

test('GET /search datetime matches items by range', async (t) => {
  const response = await t.context.api.client.get('search', {
    searchParams: {
      collections: 'landsat-8-l1',
      datetime: '2015-03-13T00:00:00Z/2015-03-31T00:00:00Z'
    }
  })
  const ids = response.features.map((item: StacItem) => item.id).sort()
  t.deepEqual(ids, [INSTANT_MAR, RANGE_ONLY, RANGE_NOMINAL].sort())
})
