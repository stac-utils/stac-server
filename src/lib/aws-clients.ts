import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3'
import { SNSClient, SNSClientConfig } from '@aws-sdk/client-sns'
import { SQSClient, SQSClientConfig } from '@aws-sdk/client-sqs'

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

export const s3 = (options: S3ClientConfig = {}): S3Client => {
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

export const sns = (options: SNSClientConfig = {}): SNSClient => {
  const overrides = useLocalStack() ? localStackParams() : {}

  return new SNSClient({
    ...overrides,
    ...options
  })
}

export const sqs = (options: SQSClientConfig = {}): SQSClient => {
  const overrides = useLocalStack() ? localStackParams() : {}

  return new SQSClient({
    ...overrides,
    ...options
  })
}
