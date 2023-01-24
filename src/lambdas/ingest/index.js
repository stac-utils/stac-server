import got from 'got' // eslint-disable-line import/no-unresolved
import { createIndex } from '../../lib/databaseClient.js'
import stream from '../../lib/databaseStream.js'
import { ingestItems } from '../../lib/ingest.js'
import getObjectJson from '../../lib/s3-utils.js'

const isSqsEvent = (event) => 'Records' in event

const isSnsMessage = (record) => record.Type === 'Notification'

const stacItemFromSnsMessage = async (message) => {
  if ('href' in message) {
    const { protocol, hostname, pathname } = new URL(message.href)

    if (protocol === 's3:') {
      return await getObjectJson({
        bucket: hostname,
        key: pathname.replace(/^\//, '')
      })
    }

    if (protocol.startsWith('http')) {
      return await got.get(message.href, {
        resolveBodyOnly: true
      }).json()
    }

    throw new Error(`Unsupported source: ${message.href}`)
  }

  return message
}

const stacItemFromRecord = async (record) => {
  const recordBody = JSON.parse(record.body)

  return isSnsMessage(recordBody)
    ? await stacItemFromSnsMessage(JSON.parse(recordBody.Message))
    : recordBody
}

const stacItemsFromSqsEvent = async (event) => {
  const records = event.Records

  return await Promise.all(
    records.map((r) => stacItemFromRecord(r))
  )
}

export default async function handler(event, context) {
  const { logger = console } = context

  logger.debug(`Event: ${JSON.stringify(event, undefined, 2)}`)

  if (event.create_indices) {
    await createIndex('collections')
  }

  const stacItems = isSqsEvent(event)
    ? await stacItemsFromSqsEvent(event)
    : [event]

  try {
    await ingestItems(stacItems, stream)
    logger.info(`Ingested ${stacItems.length} Items: ${JSON.stringify(stacItems)}`)
  } catch (error) {
    console.log(error)
    throw (error)
  }
}
