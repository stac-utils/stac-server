import logger from './logger.js'

export function isCollection(record) {
  return record && record.type === 'Collection'
}

export class InvalidSTACItemException extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
  }
}

export function isItem(record) {
  if (record && record.type === 'Feature') {
    if ('collection' in record) {
      return true
    }
    throw new InvalidSTACItemException('STAC Items must include a "collection" field')
  }
  return false
}

export function isStacEntity(record) {
  return isItem(record) || isCollection(record)
}

export function isAction(record) {
  return record && record.type === 'action'
}

export function getStartAndEndDates(record) {
  let startDate
  let endDate

  if (isCollection(record)) {
    const interval = record.extent?.temporal?.interval || [[null, null]]
    if (!interval) {
      logger.info(
        `Missing extent.temporal.interval in record ${record.id}`
      )
    }
    // STAC spec 1.0.0 says
    // "The first time interval always describes the overall temporal extent of the data"
    // Nulls are allows for open-ended intervals and nulls for both ends is not forbidden
    const [intervalStart, intervalEnd] = interval.length > 0 ? interval[0] : [null, null]
    if (intervalStart) {
      startDate = new Date(intervalStart)
    }
    if (intervalEnd) {
      endDate = new Date(intervalEnd)
    }
  } else if (isItem(record)) {
    const properties = record.properties || {}
    if (properties.start_datetime && properties.end_datetime) {
      startDate = new Date(properties.start_datetime)
      endDate = new Date(properties.end_datetime)
    } else if (properties.datetime) {
      startDate = new Date(properties.datetime)
      endDate = startDate
    } else {
      const propertiesString = JSON.stringify(properties)
      logger.info(
        `Missing properties in record ${record.id}:
        Expected datetime or both start_datetime and end_datetime in ${propertiesString}`
      )
    }
  }

  return { startDate, endDate }
}

export function getBBox(record) {
  if (isCollection(record)) {
    return record.extent?.spatial?.bbox?.length > 0
      ? record.extent.spatial.bbox[0]
      : undefined
  }
  if (isItem(record)) {
    return record.bbox || undefined
  }
  return undefined
}
