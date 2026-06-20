#!/usr/bin/env node
// Ingest the example collection and item into a locally running stac-server
// via the Transaction extension. Requires the API to be running (npm run serve)
// with ENABLE_TRANSACTIONS_EXTENSION=true (which `npm run serve` sets).

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const API = (process.env.STAC_API_URL || 'http://localhost:3000').replace(/\/$/, '')
const examplesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples')

const loadJson = async (file) =>
  JSON.parse(await readFile(path.join(examplesDir, file), 'utf8'))

const post = async (url, body, label, { tolerate404 = false } = {}) => {
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch {
    console.error(`\nCould not reach the STAC API at ${API}.`)
    console.error('Make sure the services and API are running:')
    console.error('  docker compose up -d   # OpenSearch + LocalStack')
    console.error('  npm run serve          # STAC API on :3000 (in a separate terminal)\n')
    process.exit(1)
  }
  // 409 = already exists, fine for a re-runnable example. 404 may be transient
  // while a newly created collection becomes searchable; the caller retries.
  if (res.status === 404 && tolerate404) return res.status
  if (!res.ok && res.status !== 409) {
    console.error(`Failed to ${label}: ${res.status} ${res.statusText}`)
    console.error(await res.text())
    process.exit(1)
  }
  const note = res.status === 409 ? ' (already exists)' : ''
  console.log(`  ${label}: ${res.status}${note}`)
  return res.status
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

const collection = await loadJson('sample-collection.json')
const item = await loadJson('sample-item.json')

console.log(`Ingesting example data into ${API}`)
await post(`${API}/collections`, collection, `create collection '${collection.id}'`)

// A newly created collection isn't immediately searchable (OpenSearch refreshes
// ~1s after a write), and the item endpoint validates the collection exists, so
// retry a few times on 404 before giving up.
const itemsUrl = `${API}/collections/${collection.id}/items`
for (let attempt = 1; ; attempt += 1) {
  const status = await post(itemsUrl, item, `create item '${item.id}'`, { tolerate404: attempt < 10 })
  if (status !== 404) break
  await sleep(1000)
}

console.log('\nDone. Try:')
console.log(`  curl '${API}/search?collections=${collection.id}'`)
