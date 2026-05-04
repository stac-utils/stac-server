import test from 'ava'
import type { BBox, Polygon } from 'geojson'
import { extractBbox } from '../../src/lib/api.js'
import { ValidationError } from '../../src/lib/errors.js'
import type { APIParameters } from '../../src/lib/types.js'

test('extractBboxNull', (t) => {
  const params: APIParameters = {}
  const intersectsGeometry = extractBbox(params)
  t.falsy(intersectsGeometry,
    'Returns undefined when no bbox parameter')
})

test('extractBbox JSON array', (t) => {
  const params: APIParameters = {
    bbox: [0, 0, 1, 1] as BBox
  }
  const intersectsGeometry = extractBbox(params, 'POST') as
    Polygon | undefined
  t.is(intersectsGeometry?.coordinates[0]?.length, 5)
  t.is(intersectsGeometry?.coordinates[0]?.[0]?.[0], 0)
})

test('extractBbox comma-separated value', (t) => {
  const params: APIParameters = { bbox: '0,0,1,1' }
  const intersectsGeometry = extractBbox(params) as
    Polygon | undefined
  t.is(intersectsGeometry?.coordinates[0]?.length, 5)
  t.is(intersectsGeometry?.coordinates[0]?.[0]?.[0], 0)
})

test('extractBbox comma-separated value with whitespace', (t) => {
  const params: APIParameters = { bbox: '0  ,  0.3  , 1.0,\t1' }
  const intersectsGeometry = extractBbox(params) as
    Polygon | undefined
  t.is(intersectsGeometry?.coordinates[0]?.length, 5)
  t.is(intersectsGeometry?.coordinates[0]?.[0]?.[0], 0)
})

test('extractBbox invalid bbox values', (t) => {
  const invalidBboxes: BBox[] = [
    [0.0, 1.0, 1.0, 0.0], // sw lat > ne lat, 2d
    [0.0, 1.0, 0.0, 1.0, 0.0, 1.0], // sw lat > ne lat, 3d
  ]

  const invalidLengths = [
    [1],
    [1, 2],
    [1, 2, 3],
    [1, 2, 3, 4, 5],
    [1, 2, 3, 4, 5, 6, 7],
  ]

  for (const bbox of invalidBboxes) {
    t.throws(() => {
      extractBbox({ bbox } as APIParameters, 'POST')
    }, { instanceOf: ValidationError })

    t.throws(() => {
      extractBbox({ bbox: bbox.join(',') }, 'GET')
    }, { instanceOf: ValidationError })
  }

  for (const bbox of invalidLengths) {
    t.throws(() => {
      extractBbox(
        { bbox: bbox as BBox } as APIParameters, 'POST'
      )
    }, { instanceOf: ValidationError })

    t.throws(() => {
      extractBbox({ bbox: bbox.join(',') }, 'GET')
    }, { instanceOf: ValidationError })
  }
})
