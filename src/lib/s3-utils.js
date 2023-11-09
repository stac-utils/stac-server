import { s3 } from './aws-clients.js'
import logger from './logger.js'

const getObjectBody = async (s3Location) => {
  try {
    const result = await s3().getObject({
      Bucket: s3Location.bucket,
      Key: s3Location.key
    })

    if (result.Body === undefined) {
      throw new Error(`Body of ${s3Location.url} is undefined`)
    }

    return result.Body
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Failed to fetch ${s3Location.url}`, error)
    }
    throw error
  }
}

const getObjectText = (s3Location) => getObjectBody(s3Location).then((b) =>
  b.transformToString())

export default (s3Location) => getObjectText(s3Location).then(JSON.parse)
