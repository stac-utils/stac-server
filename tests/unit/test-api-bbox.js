// @ts-nocheck

import test from 'ava'
import { extractBbox } from '../../src/lib/api.js'
import { ValidationError } from '../../src/lib/errors.js'

test('extractBboxNull', (t) => {
  const params = {}
  const intersectsGeometry = extractBbox(params)
  t.falsy(intersectsGeometry,
    'Returns undefined when no bbox parameter')
})

test('extractBbox JSON array', (t) => {
  const params = { bbox: [0, 0, 1, 1] }
  const intersectsGeometry = extractBbox(params, 'POST')
  t.is(intersectsGeometry.coordinates[0].length, 5)
  t.is(intersectsGeometry.coordinates[0][0][0], 0)
})

test('extractBbox comma-separated value', (t) => {
  const params = { bbox: '0,0,1,1' }
  const intersectsGeometry = extractBbox(params)
  t.is(intersectsGeometry.coordinates[0].length, 5)
  t.is(intersectsGeometry.coordinates[0][0][0], 0)
})

test('extractBbox comma-separated value with whitespace', (t) => {
  const params = { bbox: '0  ,  0.3  , 1.0,\t1' }
  const intersectsGeometry = extractBbox(params)
  t.is(intersectsGeometry.coordinates[0].length, 5)
  t.is(intersectsGeometry.coordinates[0][0][0], 0)
})

test('extractBbox invalid bbox values', (t) => {
  const invalidBboxes = [
    [0.0, 1.0, 1.0, 0.0], // sw lat > ne lat, 2d
    [0.0, 1.0, 0.0, 1.0, 0.0, 1.0], // sw lat > ne lat, 3d
    [1],
    [1, 2],
    [1, 2, 3],
    [1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5, 6, 7],
  ]

  for (const bbox of invalidBboxes) {
    t.throws(() => {
      extractBbox({ bbox }, 'POST')
    }, { instanceOf: ValidationError })

    t.throws(() => {
      extractBbox({ bbox: bbox.join(',') }, 'GET')
    }, { instanceOf: ValidationError })
  }
})
