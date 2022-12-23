// @ts-nocheck

const { Readable } = require('readable-stream')
const pump = require('pump')
const logger = console //require('./logger')

async function ingestItem(item, stream) {
  const readable = new Readable({ objectMode: true })
  const { toDB, dbStream } = await stream()
  const promise = new Promise((resolve, reject) => {
    pump(
      readable,
      toDB,
      dbStream,
      (error) => {
        if (error) {
          logger.info(error)
          reject(error)
        } else {
          logger.info(`Ingested item ${item.id}`)
          resolve(true)
        }
      }
    )
  })
  readable.push(item)
  readable.push(null)
  return promise
}

async function ingestItems(items, stream) {
  const readable = new Readable({ objectMode: true })
  const { toDB, dbStream } = await stream()
  const promise = new Promise((resolve, reject) => {
    pump(
      readable,
      toDB,
      dbStream,
      (error) => {
        if (error) {
          logger.info(error)
          reject(error)
        } else {
          logger.debug('Ingested item')
          resolve(true)
        }
      }
    )
  })
  items.forEach((item) => readable.push(item))
  readable.push(null)
  return promise
}

module.exports = { ingestItem, ingestItems }
