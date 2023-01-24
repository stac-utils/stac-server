// @ts-nocheck

import test from 'ava'
import { extractIntersects } from '../../src/lib/api.js'

test('extractIntersectsNull', (t) => {
  const params = {}
  const intersectsGeometry = extractIntersects(params)
  t.falsy(intersectsGeometry,
    'Returns undefined when no intersects parameter')
})

test('extractIntersects FeatureCollection', (t) => {
  t.throws(() => {
    extractIntersects({
      intersects: { type: 'FeatureCollection' }
    })
  },
  { instanceOf: Error, message: 'Expected GeoJSON geometry, not Feature or FeatureCollection' },
  'Throws exception when GeoJSON type is FeatureCollection')
})
