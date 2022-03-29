const test = require('ava')
const api = require('../../src/lib/api')

test('extractIntersectsNull', (t) => {
  const params = {}
  const intersectsGeometry = api.extractIntersects(params)
  t.falsy(intersectsGeometry,
    'Returns undefined when no intersects parameter')
})

test('extractIntersects FeatureCollection', (t) => {
  t.throws(() => {
    api.extractIntersects({
      intersects: { type: 'FeatureCollection' }
    })
  },
  { instanceOf: Error, message: 'Expected GeoJSON geometry, not Feature or FeatureCollection' },
  'Throws exception when GeoJSON type is FeatureCollection')
})
