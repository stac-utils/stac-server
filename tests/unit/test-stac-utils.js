// @ts-nocheck

import test from 'ava'
import { getStartAndEndDates } from '../../src/lib/stac-utils.js'

test('getStartandEndDates uses item datetime', (t) => {
  const stringDate = '1955-11-05T13:00:00Z'
  const { startDate, endDate } = getStartAndEndDates({
    type: 'Feature',
    id: 'test',
    properties: {
      datetime: stringDate
    }
  })
  const date = new Date(stringDate)
  t.deepEqual(date, startDate, 'startDate did not match datetime')
  t.deepEqual(date, endDate, 'endDate did not match datetime')
})

test('getStartandEndDates uses item start_datetime and end_datetime', (t) => {
  const datetime = '1955-11-05T13:00:00Z'
  const startDatetime = '1985-11-05T13:00:00Z'
  const endDatetime = '2015-11-05T13:00:00Z'
  const { startDate, endDate } = getStartAndEndDates({
    type: 'Feature',
    id: 'test',
    properties: {
      datetime,
      start_datetime: startDatetime,
      end_datetime: endDatetime,
    }
  })
  t.deepEqual(new Date(startDatetime), startDate, 'startDate did not match start_datetime')
  t.deepEqual(new Date(endDatetime), endDate, 'endDate did not match end_datetime')
})

test('getStartandEndDates uses item start_datetime and end_datetime with null datetime', (t) => {
  const startDatetime = '1985-11-05T13:00:00Z'
  const endDatetime = '2015-11-05T13:00:00Z'
  const { startDate, endDate } = getStartAndEndDates({
    type: 'Feature',
    id: 'test',
    properties: {
      datetime: null,
      start_datetime: startDatetime,
      end_datetime: endDatetime,
    }
  })
  t.deepEqual(new Date(startDatetime), startDate, 'startDate did not match start_datetime')
  t.deepEqual(new Date(endDatetime), endDate, 'endDate did not match end_datetime')
})

test('getStartandEndDates returns undefineds if item datetime is null', (t) => {
  const { startDate, endDate } = getStartAndEndDates({
    type: 'Feature',
    id: 'test',
    properties: {
      datetime: null
    }
  })
  t.deepEqual(undefined, startDate, 'startDate is not undefined')
  t.deepEqual(undefined, endDate, 'endDate is not undefined')
})

test('getStartandEndDates returns undefineds if collection interval is missing', (t) => {
  const { startDate, endDate } = getStartAndEndDates({
    type: 'Collection',
    id: 'test',
    extent: {
      temporal: {
        interval: []
      }
    }
  })
  t.deepEqual(undefined, startDate, 'startDate is not undefined')
  t.deepEqual(undefined, endDate, 'endDate is not undefined')
})

test('getStartandEndDates returns startDate if collection interval has start', (t) => {
  const startDatetime = '1985-11-05T13:00:00Z'
  const { startDate, endDate } = getStartAndEndDates({
    type: 'Collection',
    id: 'test',
    extent: {
      temporal: {
        interval: [[startDatetime, null]]
      }
    }
  })
  t.deepEqual(new Date(startDatetime), startDate, 'startDate was not returned')
  t.deepEqual(undefined, endDate, 'endDate is not undefined')
})

test('getStartandEndDates returns endDate if collection interval has end', (t) => {
  const endDatetime = '1985-11-05T13:00:00Z'
  const { startDate, endDate } = getStartAndEndDates({
    type: 'Collection',
    id: 'test',
    extent: {
      temporal: {
        interval: [[null, endDatetime]]
      }
    }
  })
  t.deepEqual(undefined, startDate, 'startDate is not undefined')
  t.deepEqual(new Date(endDatetime), endDate, 'endDate was not returned')
})

test('getStartandEndDates returns collection interval', (t) => {
  const startDatetime = '1955-11-05T13:00:00Z'
  const endDatetime = '1985-11-05T13:00:00Z'
  const { startDate, endDate } = getStartAndEndDates({
    type: 'Collection',
    id: 'test',
    extent: {
      temporal: {
        interval: [[startDatetime, endDatetime]]
      }
    }
  })
  t.deepEqual(new Date(startDatetime), startDate, 'startDate was not returned')
  t.deepEqual(new Date(endDatetime), endDate, 'endDate was not returned')
})

test('getStartandEndDates only looks at first collection interval', (t) => {
  const { startDate, endDate } = getStartAndEndDates({
    type: 'Collection',
    id: 'test',
    extent: {
      temporal: {
        interval: [[null, null], ['1955-11-05T13:00:00Z', '1985-11-05T13:00:00Z']]
      }
    }
  })
  t.deepEqual(undefined, startDate, 'startDate is not undefined')
  t.deepEqual(undefined, endDate, 'endDate is not undefined')
})
