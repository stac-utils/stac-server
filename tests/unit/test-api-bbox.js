// @ts-nocheck

const test = require('ava')
const api = require('../../src/lib/api')

test('extractBboxNull', (t) => {
  const params = {}
  const intersectsGeometry = api.extractBbox(params)
  t.falsy(intersectsGeometry,
    'Returns undefined when no bbox parameter')
})

test('extractBbox JSON array', (t) => {
  const params = { bbox: [0, 0, 1, 1] }
  const intersectsGeometry = api.extractBbox(params, 'POST')
  t.is(intersectsGeometry.coordinates[0].length, 5)
  t.is(intersectsGeometry.coordinates[0][0][0], 0)
})

test('extractBbox comma-separated value', (t) => {
  const params = { bbox: '0,0,1,1' }
  const intersectsGeometry = api.extractBbox(params)
  t.is(intersectsGeometry.coordinates[0].length, 5)
  t.is(intersectsGeometry.coordinates[0][0][0], 0)
})

test('extractBbox comma-separated value with whitespace', (t) => {
  const params = { bbox: '0  ,  0.3  , 1.0,\t1' }
  const intersectsGeometry = api.extractBbox(params)
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
      api.extractBbox({ bbox }, 'POST')
    }, { instanceOf: api.ValidationError })

    t.throws(() => {
      api.extractBbox({ bbox: bbox.join(',') }, 'GET')
    }, { instanceOf: api.ValidationError })
  }
})
