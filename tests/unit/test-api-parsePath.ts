import test from 'ava'
import { parsePath } from '../../src/lib/api.js'

test('parsePath', (t) => {
  let expected = {
    root: true,
    api: false,
    conformance: false,
    collections: false,
    search: false,
    collectionId: false,
    items: false,
    itemId: false,
    edit: false
  }
  let actual = parsePath('/')
  t.deepEqual(actual, expected)

  expected = {
    root: false,
    api: true,
    conformance: false,
    collections: false,
    search: false,
    collectionId: false,
    items: false,
    itemId: false,
    edit: false
  }
  actual = parsePath('/api')
  t.deepEqual(actual, expected)

  expected = {
    root: false,
    api: false,
    conformance: true,
    collections: false,
    search: false,
    collectionId: false,
    items: false,
    itemId: false,
    edit: false
  }
  actual = parsePath('/conformance')
  t.deepEqual(actual, expected)

  expected = {
    root: false,
    api: false,
    conformance: false,
    collections: false,
    search: true,
    collectionId: false,
    items: false,
    itemId: false,
    edit: false
  }
  actual = parsePath('/search')
  t.deepEqual(actual, expected)

  expected = {
    root: false,
    api: false,
    conformance: false,
    collections: true,
    search: false,
    collectionId: false,
    items: false,
    itemId: false,
    edit: false
  }
  actual = parsePath('/collections')
  t.deepEqual(actual, expected)

  expected = {
    root: false,
    api: false,
    conformance: false,
    collections: true,
    search: false,
    collectionId: 'id',
    items: false,
    itemId: false,
    edit: false
  }
  actual = parsePath('/collections/id')
  t.deepEqual(actual, expected)

  expected = {
    root: false,
    api: false,
    conformance: false,
    collections: true,
    search: false,
    collectionId: 'id',
    items: true,
    itemId: false,
    edit: false
  }
  actual = parsePath('/collections/id/items')
  t.deepEqual(actual, expected)

  expected = {
    root: false,
    api: false,
    conformance: false,
    collections: true,
    search: false,
    collectionId: 'id',
    items: true,
    itemId: 'id',
    edit: false
  }
  actual = parsePath('/collections/id/items/id')
  t.deepEqual(actual, expected)
})
