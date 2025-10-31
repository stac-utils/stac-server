import { S3Client } from '@aws-sdk/client-s3'
import { SNSClient } from '@aws-sdk/client-sns'
import { SQSClient } from '@aws-sdk/client-sqs'

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

  return new S3Client({
    ...overrides,
    ...options
  })
}

export const sns = (options = {}) => {
  const overrides = useLocalStack() ? localStackParams() : {}

  return new SNSClient({
    ...overrides,
    ...options
  })
}

export const sqs = (options = {}) => {
  const overrides = useLocalStack() ? localStackParams() : {}

  return new SQSClient({
    ...overrides,
    ...options
  })
}

export default {
  s3,
  sns,
  sqs
}
