import anyTest, { type TestFn } from 'ava'
import { deleteAllIndices, refreshIndices } from '../helpers/database.js'
import { ingestItem } from '../helpers/ingest.js'
import { randomId, loadFixture } from '../helpers/utils.js'
import { setup } from '../helpers/system-tests.js'
import type { StandUpResult } from '../helpers/system-tests.js'
import type { Link } from '../../src/lib/types.js'

type TestContext = StandUpResult & { collectionId: string }
const test = anyTest as TestFn<TestContext>

/* eslint-disable @typescript-eslint/no-explicit-any, no-await-in-loop */

const ingest = async (t: any, item: unknown) => ingestItem({
  ingestQueueUrl: t.context.ingestQueueUrl,
  ingestTopicArn: t.context.ingestTopicArn,
  item
})

// follow a server-issued absolute link href against the local test client
const followNext = async (t: any, links: Link[]) => {
  const next = links.find((l) => l.rel === 'next')
  if (!next) return undefined
  const path = next.href.replace(/^https?:\/\/[^/]+\//, '')
  // POST searches return POST-style pagination links (the token is in the body,
  // not the href), so follow them with the link's method.
  if (next.method === 'POST') {
    return t.context.api.client.post(path, {
      resolveBodyOnly: false,
      throwHttpErrors: false,
      json: next.body
    })
  }
  return t.context.api.client.get(path, { resolveBodyOnly: false, throwHttpErrors: false })
}

test.before(async (t) => {
  await deleteAllIndices()
  t.context = (await setup()) as TestContext
  t.context.collectionId = randomId('collection')
  await ingest(t, await loadFixture('landsat-8-l1-collection.json', { id: t.context.collectionId }))
  await refreshIndices()
})

test.after.always(async (t) => { if (t.context.api) await t.context.api.close() })

// Regression for #608 / #1082: items with a null `datetime` (start/end set
// instead) broke pagination — OpenSearch emits a Long sentinel sort value that
// the old comma-joined `next` token corrupted, 400ing the follow-up page.
test.serial('paginates through items with null datetime', async (t) => {
  const { collectionId } = t.context
  const ids: string[] = []
  for (let i = 0; i < 3; i += 1) {
    const id = `nodt-${i}`
    ids.push(id)
    await ingest(t, await loadFixture('stac/LC80100102015050LGN00.json', {
      id,
      collection: collectionId,
      properties: {
        datetime: null,
        start_datetime: `2015-01-0${i + 1}T00:00:00Z`,
        end_datetime: `2015-01-0${i + 1}T01:00:00Z`
      }
    }))
  }
  await refreshIndices()

  const seen = new Set<string>()
  let resp = await t.context.api.client.get(
    `collections/${collectionId}/items?limit=1`,
    { resolveBodyOnly: false, throwHttpErrors: false }
  )
  for (let page = 0; page < 5; page += 1) {
    t.is(resp.statusCode, 200, `page ${page} status`)
    for (const f of resp.body.features) seen.add(f.id)
    const next = await followNext(t, resp.body.links)
    if (!next || resp.body.features.length === 0) break
    resp = next
  }

  for (const id of ids) t.true(seen.has(id), `paginated to ${id}`)
})

// Regression for the custom-`sortby` variant of #608 / #1082: a custom sort
// replaces the default sort's unique `id`/`collection` tiebreakers. When some
// items lack the sort field they all collapse to the same missing-value sort
// key, and with no tiebreaker `search_after` can't disambiguate them — the
// follow-up page skips those items entirely. buildSort must append the `id`
// tiebreaker to custom sorts, as the default sort already guarantees.
test.serial('paginates a custom sortby when some items lack the field', async (t) => {
  const { collectionId } = t.context
  const ids: string[] = []
  for (let i = 0; i < 4; i += 1) {
    const id = `csort-${i}`
    ids.push(id)
    // Half the items have `eo:cloud_cover`; half omit it (fixture properties are
    // shallow-replaced by the override, so omitting the key removes the field).
    const properties: Record<string, unknown> = {
      datetime: `2017-01-0${i + 1}T00:00:00Z`
    }
    if (i % 2 === 0) properties['eo:cloud_cover'] = i * 10
    await ingest(t, await loadFixture('stac/LC80100102015050LGN00.json', {
      id,
      collection: collectionId,
      properties
    }))
  }
  await refreshIndices()

  const seen = new Set<string>()
  let resp = await t.context.api.client.post('search', {
    resolveBodyOnly: false,
    throwHttpErrors: false,
    json: {
      collections: [collectionId],
      limit: 1,
      sortby: [{ field: 'properties.eo:cloud_cover', direction: 'desc' }]
    }
  })
  for (let page = 0; page < 8; page += 1) {
    t.is(resp.statusCode, 200, `page ${page} status`)
    for (const f of resp.body.features) seen.add(f.id)
    const next = await followNext(t, resp.body.links)
    if (!next || resp.body.features.length === 0) break
    resp = next
  }

  for (const id of ids) t.true(seen.has(id), `paginated to ${id}`)
})

// Regression for #823: a `next` link must be returned even when the `sortby`
// field is excluded via the fields extension (pagination uses OpenSearch's sort
// metadata, not the item body).
test.serial('returns next link when the sortby field is excluded', async (t) => {
  const { collectionId } = t.context
  for (let i = 0; i < 3; i += 1) {
    await ingest(t, await loadFixture('stac/LC80100102015050LGN00.json', {
      id: `srt-${i}`,
      collection: collectionId,
      properties: {
        datetime: `2016-01-0${i + 1}T00:00:00Z`,
        updated: `2016-02-0${i + 1}T00:00:00Z`
      }
    }))
  }
  await refreshIndices()

  const resp = await t.context.api.client.post('search', {
    resolveBodyOnly: false,
    json: {
      collections: [collectionId],
      limit: 1,
      sortby: [{ field: 'properties.updated', direction: 'desc' }],
      fields: { exclude: ['properties.updated'], include: [] }
    }
  })
  t.is(resp.statusCode, 200)
  t.is(resp.body.features.length, 1)
  const next = resp.body.links.find((l: Link) => l.rel === 'next')
  t.truthy(next, 'next link present despite excluded sortby field')

  // Following the (POST) next link must return the *next* item, not repeat page 1.
  const page2 = await followNext(t, resp.body.links)
  t.is(page2?.statusCode, 200, 'second page fetches successfully')
  t.is(page2?.body.features.length, 1)
  t.not(page2?.body.features[0].id, resp.body.features[0].id, 'page 2 is a different item')
})
