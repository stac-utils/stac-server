// @ts-nocheck

const { S3, SNS, SQS } = require('aws-sdk')

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

const s3 = (options = {}) => {
  const localStackOverrides = {
    ...localStackParams(),
    s3ForcePathStyle: true
  }

  const overrides = useLocalStack() ? localStackOverrides : {}

  return new S3({
    ...overrides,
    ...options
  })
}

const sns = (options = {}) => {
  const overrides = useLocalStack() ? localStackParams() : {}

  return new SNS({
    ...overrides,
    ...options
  })
}

const sqs = (options = {}) => {
  const overrides = useLocalStack() ? localStackParams() : {}

  return new SQS({
    ...overrides,
    ...options
  })
}

module.exports = {
  s3,
  sns,
  sqs
}
