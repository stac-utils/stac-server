import logger from './logger.js'

export function isCollection(record) {
  return record && record.type === 'Collection'
}

export function isItem(record) {
  return record && record.type === 'Feature'
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
