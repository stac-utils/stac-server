const test = require('ava')
const sinon = require('sinon')
const MemoryStream = require('memorystream')
const { ingestItems } = require('../libs/ingest')
const firstItem = require('./fixtures/stac/LC80100102015050LGN00.json')
const stream = require('../libs/esStream.js')

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

// test('ingest logs request error and continues', async (t) => {
//   const error = sinon.spy()
//   const stubFsRead = sinon.stub(fs, 'readFile')
//   stubFsRead.callThrough()
//   const errorMessage = 'errorMessage'
//   stubFsRead.withArgs('./fixtures/stac/LC80100102015050LGN00.json')
//     .throws(new Error(errorMessage))
//   const proxyIngest = proxquire('../libs/ingest', {
//     './logger': {
//       error,
//       info: () => {}
//     },
//     fs: stubFsRead
//   })
//   const { esStream, backend } = setup()
//   await proxyIngest.ingest('./fixtures/stac/catalog.json', backend)
//   t.is(error.firstCall.args[0], errorMessage,
//     'Logs error via Winston transport')
//   t.is(esStream.queue.length, 6, 'Skips errored request and continues')
// })

test('ingestItem passes item through transform stream', async (t) => {
  const { esStream, backend } = setup()
  await ingestItems([firstItem], stream)
  t.deepEqual(esStream.queue[0], firstItem)
})
