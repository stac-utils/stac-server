import { S3 } from '@aws-sdk/client-s3'
import { SNS } from '@aws-sdk/client-sns'
import { SQS } from '@aws-sdk/client-sqs'

const localStackEndpointEnvVar = 'LOCAL_STACK_ENDPOINT'

const useLocalStack = () => {
  if (process.env[localStackEndpointEnvVar]) return true
  return process.env['NODE_ENV'] === 'test'
}

const localStackEndpoint = () => process.env[localStackEndpointEnvVar] || 'http://127.0.0.1:4566'

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
    forcePathStyle: true
  }

  const overrides = useLocalStack() ? localStackOverrides : {}

  return new S3({
    ...overrides,
    ...options
  })
}

export const sns = (options = {}) => {
  const overrides = useLocalStack() ? localStackParams() : {}

  return new SNS({
    ...overrides,
    ...options
  })
}

export const sqs = (options = {}) => {
  const overrides = useLocalStack() ? localStackParams() : {}

  return new SQS({
    ...overrides,
    ...options
  })
}

export default {
  s3,
  sns,
  sqs
}
