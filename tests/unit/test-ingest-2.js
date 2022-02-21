const test = require('ava')
const sinon = require('sinon')
const MemoryStream = require('memorystream')
const { ingestItems } = require('../../src/lib/ingest')
const firstItem = require('../fixtures/stac/LC80100102015050LGN00.json')
const stream = require('../../src/lib/esStream')

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
  // Catalog is filtered by real toEs transform stream but is left in here.
  const toEs = new MemoryStream(null, dupOptions)
  const esStream = new MemoryStream(null, writeOptions)
  const backend = {
    stream: () => ({ toEs, esStream }),
    prepare: sinon.stub().resolves(true)
  }
  return {
    toEs,
    esStream,
    backend
  }
}

test.skip('ingestItem passes item through transform stream', async (t) => {
  const { esStream } = setup()
  await ingestItems([firstItem], stream)
  t.deepEqual(esStream.queue[0], firstItem)
})
