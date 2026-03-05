import test from 'ava'
import { extractFields } from '../../src/lib/api.js'
import { buildFieldsFilter, DEFAULT_FIELDS } from '../../src/lib/database.js'

test('buildFieldsFilter - include and exclude missing', (t) => {
  const params = { fields: {} }
  const fieldsFilter = buildFieldsFilter(params)
  t.deepEqual(fieldsFilter, { _sourceIncludes: [], _sourceExcludes: [] })
})

test('buildFieldsFilter - exclude is missing', (t) => {
  const params = { fields: { include: ['geometry'] } }
  const fieldsFilter = buildFieldsFilter(params)
  t.deepEqual(fieldsFilter, {
    _sourceIncludes: ['geometry'],
    _sourceExcludes: []
  })
})

test('buildFieldsFilter - include is missing', (t) => {
  const params = { fields: { exclude: ['geometry'] } }
  const fieldsFilter = buildFieldsFilter(params)
  t.deepEqual(fieldsFilter, {
    _sourceExcludes: ['geometry'],
    _sourceIncludes: []
  })
})

test('buildFieldsFilter - include and exclude null', (t) => {
  const params = { fields: { include: null, exclude: null } }
  const fieldsFilter = buildFieldsFilter(params)
  t.deepEqual(fieldsFilter, {
    _sourceIncludes: DEFAULT_FIELDS,
    _sourceExcludes: []
  })
})

test('buildFieldsFilter - nested include field', (t) => {
  const params = { fields: {
    exclude: ['properties'],
    include: ['properties.title']
  } }
  const fieldsFilter = buildFieldsFilter(params)
  t.deepEqual(fieldsFilter, {
    _sourceIncludes: ['properties.title'],
    _sourceExcludes: []
  })
})

test('buildFieldsFilter - nested exclude field', (t) => {
  const params = { fields: {
    exclude: ['properties.title'],
    include: ['properties']
  } }
  const fieldsFilter = buildFieldsFilter(params)
  t.deepEqual(fieldsFilter, {
    _sourceIncludes: ['properties'],
    _sourceExcludes: ['properties.title']
  })
})

test('buildFieldsFilter - same field in both include & exclude', (t) => {
  const params = { fields: {
    include: ['collection'],
    exclude: ['collection']
  } }
  const fieldsFilter = buildFieldsFilter(params)
  t.deepEqual(fieldsFilter, {
    _sourceIncludes: ['collection'],
    _sourceExcludes: []
  })
})

test('extractFields - GET style', (t) => {
  const params = { fields: 'geometry,+properties,-collection' }
  const fieldRules = extractFields(params)
  t.deepEqual(fieldRules, { include: ['geometry', 'properties'], exclude: ['collection'] })
})
