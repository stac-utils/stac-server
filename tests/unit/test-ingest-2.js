import test from 'ava'
import { stub } from 'sinon'
import MemoryStream from 'memorystream'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ingestItems } from '../../src/lib/ingest.js'
import stream from '../../src/lib/databaseStream.js'

const setup = () => {
  const dupOptions = {
    readable: true,
    writable: true,
    objectMode: true
  }
  const writeOptions = {
    writable: true,
    readable: false,
    objectMode: true
  }
  // Catalog is filtered by real toDB transform stream but is left in here.
  // @ts-ignore
  const toDB = new MemoryStream(undefined, dupOptions)
  // @ts-ignore
  const dbStream = new MemoryStream(undefined, writeOptions)
  const backend = {
    stream: () => ({ toDB, dbStream }),
    prepare: stub().resolves(true)
  }
  return {
    toDB,
    dbStream,
    backend
  }
}

test.skip('ingestItem passes item through transform stream', async (t) => {
  const { dbStream } = setup()

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename) // eslint-disable-line no-unused-vars

  const firstItem = fs.readFileSync(path.resolve(__dirname, '../fixtures/stac/LC80100102015050LGN00.json'))

  await ingestItems([firstItem], stream)
  // @ts-ignore
  t.deepEqual(dbStream.queue[0], firstItem)
})
