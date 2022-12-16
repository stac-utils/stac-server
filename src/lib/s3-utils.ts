import awsClients from './aws-clients'

const getObjectBody = async (s3Location: {bucket: string, key: string}) => {
  try {
    const result = await awsClients.s3().getObject({
      Bucket: s3Location.bucket,
      Key: s3Location.key
    }).promise()

    if (result.Body === undefined) {
      throw new Error(`Body of ${s3Location.bucket}/${s3Location.key} is undefined`)
    }

    return result.Body
  } catch (error) {
    if (error instanceof Error) {
      console.log(`Failed to fetch ${s3Location.bucket}/${s3Location.key}: ${error.message}`)
    }
    throw error
  }
}

const getObjectText = (s3Location: {bucket: string, key: string}) =>
  getObjectBody(s3Location).then((b) => b.toString())

export const getObjectJson = (s3Location: {bucket: string, key: string}) =>
  getObjectText(s3Location).then(JSON.parse)
