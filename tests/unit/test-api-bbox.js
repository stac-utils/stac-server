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
  const intersectsGeometry = api.extractBbox(params)
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
