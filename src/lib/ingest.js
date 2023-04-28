import { Readable } from 'readable-stream'
import pump from 'pump'
import { getItemCreated } from './database.js'
import logger from './logger.js'

const COLLECTIONS_INDEX = process.env['COLLECTIONS_INDEX'] || 'collections'

export async function convertIngestObjectToDbObject(
  // eslint-disable-next-line max-len
  /** @type {{ hasOwnProperty: (arg0: string) => any; collection: string; links: any[]; id: any; }} */ data
) {
  let index = ''
  logger.debug('data', data)
  if (data && data.hasOwnProperty('extent')) {
    index = COLLECTIONS_INDEX
  } else if (data && data.hasOwnProperty('geometry')) {
    index = data.collection
  } else {
    return null
  }

  // remove any hierarchy links in a non-mutating way
  const hlinks = ['self', 'root', 'parent', 'child', 'collection', 'item', 'items']
  const links = data.links.filter(
    (/** @type {{ rel: string; }} */ link) => !hlinks.includes(link.rel)
  )
  const dbDataObject = { ...data, links }

  if (data.hasOwnProperty('properties')) {
    const now = (new Date()).toISOString()

    const created = (await getItemCreated(data.collection, data.id)) || now

    // @ts-ignore
    dbDataObject.properties.created = created
    // @ts-ignore
    dbDataObject.properties.updated = now
  }

  return {
    index,
    id: dbDataObject.id,
    action: 'index',
    _retry_on_conflict: 3,
    body: dbDataObject
  }
}

export async function ingestItems(items, stream) {
  const readable = new Readable({ objectMode: true })
  const { toDB, dbStream } = await stream()
  const promise = new Promise((resolve, reject) => {
    pump(
      readable,
      toDB,
      dbStream,
      (error) => {
        if (error) {
          logger.error('Error ingesting', error)
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

export async function ingestItem(item, stream) {
  return ingestItems([item], stream)
}
