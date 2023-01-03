const awsClients = require('./aws-clients').default

const getObjectBody = async (s3Location) => {
  try {
    const result = await awsClients.s3().getObject({
      Bucket: s3Location.bucket,
      Key: s3Location.key
    }).promise()

    if (result.Body === undefined) {
      throw new Error(`Body of ${s3Location.url} is undefined`)
    }

    return result.Body
  } catch (error) {
    if (error instanceof Error) {
      console.log(`Failed to fetch ${s3Location.url}: ${error.message}`)
    }
    throw error
  }
}

const getObjectText = (s3Location) => getObjectBody(s3Location).then((b) => b.toString())

const getObjectJson = (s3Location) => getObjectText(s3Location).then(JSON.parse)

export default {
  getObjectJson
}
