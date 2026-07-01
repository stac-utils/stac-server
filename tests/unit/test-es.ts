import test from 'ava'
import {
  constructSearchParams,
  buildDatetimeQuery,
  collectionUniqueIndexID,
  resolveCollectionIndices
} from '../../src/lib/database.js'
import type { OpenSearchFilterQuery, QueryParameters } from '../../src/lib/types.js'

const indexFilterFor = (filters?: OpenSearchFilterQuery | OpenSearchFilterQuery[]) => {
  if (!filters) return undefined
  const list = Array.isArray(filters) ? filters : [filters]
  return list.find((f) => f.terms?.['_index'])
}

// The index-scoping assertions below expect the default (non-mapping) index
// restriction. Clear the mapping env var so an ambient value can't add mapped
// remote indices and make these tests environment-dependent.
test.beforeEach(() => {
  delete process.env['COLLECTION_TO_INDEX_MAPPINGS']
})

test('search id parameter doesnt override other parameters', async (t) => {
  const ids = 'a,b,c'
  const range = '2007-03-01T13:00:00Z/2008-05-11T15:30:00Z'
  const queryParams = {
    ids,
    datetime: range
  } as QueryParameters
  const searchBody = await constructSearchParams(queryParams, 1)

  // TODO: the ordering here is fragile. helper methods needed to ensure the queries are correct
  t.is(
    searchBody.body.query.bool?.filter?.[0].terms?.['id'],
    ids,
    'query contains id filter'
  )
  t.assert(
    searchBody.body.query.bool?.filter?.[1].range?.['properties.datetime'],
    'query contains datetime filter'
  )
})

/* eslint max-len: 0 */
test('search datetime parameter intervals are correctly parsed', async (t) => {
  const datetimes: [string, string | undefined, string | undefined][] = [
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

  await Promise.all(datetimes.map(async ([datetime, start, end]) => {
    const dtQuery = await buildDatetimeQuery({ datetime })
    t.is(dtQuery!.range?.['properties.datetime']?.['gte'], start, 'datetime interval start')
    t.is(dtQuery!.range?.['properties.datetime']?.['lte'], end, 'datetime interval end')
  }))
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

  await Promise.all(validDatetimes.map(async (datetime) => {
    const dtQuery = await buildDatetimeQuery({ datetime })
    t.is(dtQuery!.term?.['properties.datetime'], datetime, 'datetime instant parses correctly')
  }))
})

test('a small collection list is scoped in the request path, not the body', async (t) => {
  const collections = ['a', 'b', 'c']
  const params = await constructSearchParams({ collections }, 1)

  // The path lists the resolved (hashed) indices so OpenSearch prunes shards at
  // the coordinating node.
  t.deepEqual(params.index, collections.map((c) => collectionUniqueIndexID(c)))

  // No _index body filter is added in this case.
  t.is(indexFilterFor(params.body.query.bool?.filter), undefined)
})

test('a large collection list falls back to an _index body filter', async (t) => {
  // Enough collections that the joined hashed index names exceed the path-length
  // limit, forcing the body-filter fallback.
  const collections = Array.from({ length: 200 }, (_, i) => `collection-${i}`)
  const params = await constructSearchParams({ collections }, 1)

  // The path keeps the default restriction; it does not list the collections.
  t.deepEqual(params.index, ['*', '-.*', '-collections'])

  // The collections are restricted via an _index terms filter in the body,
  // using the hashed index ids.
  const indexFilter = indexFilterFor(params.body.query.bool?.filter)
  t.deepEqual(
    indexFilter?.terms?.['_index'],
    collections.map((c) => collectionUniqueIndexID(c))
  )
})

test('resolveCollectionIndices hashes every collection id when the mapping is empty', (t) => {
  const collections = ['a', 'b', 'c']
  t.deepEqual(
    resolveCollectionIndices(collections, {}),
    collections.map((c) => collectionUniqueIndexID(c))
  )
})

test('resolveCollectionIndices uses a mapped index name as-is, without hashing', (t) => {
  const mapping = { a: 'shared-index', b: 'cluster:remote-index' }
  t.deepEqual(
    resolveCollectionIndices(['a', 'b'], mapping),
    ['shared-index', 'cluster:remote-index']
  )
})

test('resolveCollectionIndices falls back to the hashed id for unmapped collections', (t) => {
  // In mapping mode, a collection absent from the mapping must still resolve to
  // its hashed index name, not its raw id.
  const mapping = { a: 'shared-index' }
  t.deepEqual(
    resolveCollectionIndices(['a', 'b'], mapping),
    ['shared-index', collectionUniqueIndexID('b')]
  )
})

test('resolveCollectionIndices handles a mix of mapped and unmapped collections', (t) => {
  const mapping = { mapped1: 'idx-1', mapped2: 'idx-2' }
  t.deepEqual(
    resolveCollectionIndices(['mapped1', 'unmapped', 'mapped2'], mapping),
    ['idx-1', collectionUniqueIndexID('unmapped'), 'idx-2']
  )
})
