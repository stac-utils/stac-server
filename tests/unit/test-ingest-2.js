const test = require('ava')
const sinon = require('sinon')
const MemoryStream = require('memorystream')
const { ingestItems } = require('../../src/lib/ingest')
const firstItem = require('../fixtures/stac/LC80100102015050LGN00.json')
const stream = require('../../src/lib/databaseStream')

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
    prepare: sinon.stub().resolves(true)
  }
  return {
    toDB,
    dbStream,
    backend
  }
}

test.skip('ingestItem passes item through transform stream', async (t) => {
  const { dbStream } = setup()
  await ingestItems([firstItem], stream)
  t.deepEqual(dbStream.queue[0], firstItem)
})
