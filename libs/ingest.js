const { Readable } = require('readable-stream')
const pump = require('pump')
const logger = console //require('./logger')


async function ingestItem(item, backend) {
  const readable = new Readable({objectMode: true })
  const { toEs, esStream } = await backend.stream()
  const promise = new Promise((resolve, reject) => {
    pump(
      readable,
      toEs,
      esStream,
      (error) => {
        if (error) {
          console.log(error)
          reject(error)
        } else {
          console.log(`Ingested item ${item.id}`)
          resolve(true)
        }
      }
    )
  })
  readable.push(item)
  readable.push(null)
  return promise
}

async function ingestItems(items, backend) {
  const readable = new Readable({ objectMode: true })
  const { toEs, esStream } = await backend.stream()
  const promise = new Promise((resolve, reject) => {
    pump(
      readable,
      toEs,
      esStream,
      (error) => {
        if (error) {
          console.log(error)
          reject(error)
        } else {
          console.log('Ingested item')
          resolve(true)
        }
      }
    )
  })
  items.forEach((item) => readable.push(item))
  readable.push(null)
  return promise
}

module.exports = { ingest, ingestItem, ingestItems }
