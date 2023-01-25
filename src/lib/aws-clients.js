import AWS from 'aws-sdk'

const localStackEndpointEnvVar = 'LOCAL_STACK_ENDPOINT'

const useLocalStack = () => {
  if (process.env[localStackEndpointEnvVar]) return true
  return process.env.NODE_ENV === 'test'
}

const localStackEndpoint = () => process.env[localStackEndpointEnvVar] || 'http://localhost:4566'

const localStackParams = () => ({
  credentials: {
    accessKeyId: 'accessKeyId',
    secretAccessKey: 'secretAccessKey'
  },
  endpoint: localStackEndpoint(),
  region: 'us-east-1'
})

export const s3 = (options = {}) => {
  const localStackOverrides = {
    ...localStackParams(),
    s3ForcePathStyle: true
  }

  const overrides = useLocalStack() ? localStackOverrides : {}

  return new AWS.S3({
    ...overrides,
    ...options
  })
}

export const sns = (options = {}) => {
  const overrides = useLocalStack() ? localStackParams() : {}

  return new AWS.SNS({
    ...overrides,
    ...options
  })
}

export const sqs = (options = {}) => {
  const overrides = useLocalStack() ? localStackParams() : {}

  return new AWS.SQS({
    ...overrides,
    ...options
  })
}

export default {
  s3,
  sns,
  sqs
}
