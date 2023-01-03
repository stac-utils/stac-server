import test from 'ava'
import { stub } from 'sinon'
import MemoryStream from 'memorystream'
import fs from 'fs'
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
  const toDB = new MemoryStream(null, dupOptions)
  const dbStream = new MemoryStream(null, writeOptions)
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
  const firstItem = fs.readFileSync('../fixtures/stac/LC80100102015050LGN00.json', 'utf8')

  await ingestItems([firstItem], stream)
  t.deepEqual(dbStream.queue[0], firstItem)
})
