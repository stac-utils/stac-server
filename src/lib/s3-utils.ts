import { GetObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from './aws-clients.js'

const getObjectBody = async (s3Location: {bucket: string, key: string}) => {
  try {
    const command = new GetObjectCommand({
      Bucket: s3Location.bucket,
      Key: s3Location.key
    })

    const result = await s3().send(command)

    if (result.Body === undefined) {
      throw new Error(`Body of ${s3Location.bucket}/${s3Location.key} is undefined`)
    }

    return result.Body
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Failed to fetch ${s3Location.bucket}/${s3Location.key}: ${error.message}`)
    }
    throw error
  }
}

const getObjectText = (s3Location: {bucket: string, key: string}) =>
  getObjectBody(s3Location).then((b) => b.transformToString())

const getObjectJson = (s3Location: {bucket: string, key: string}) =>
  getObjectText(s3Location).then(JSON.parse)

export default getObjectJson
