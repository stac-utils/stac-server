/* eslint-disable @typescript-eslint/no-empty-function */
// ts-check

import test from 'ava'
import { mockClient } from 'aws-sdk-client-mock'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import { handler, apiKeys } from '../../src/lambdas/pre-hook/index.js'

const DEFAULT_EVENT = {
  body: 'eyJ0ZXN0IjoiYm9keSJ9',
  resource: '/{proxy+}',
  path: '/path/to/resource',
  httpMethod: 'POST',
  isBase64Encoded: true,
  queryStringParameters: {
    foo: 'bar',
  },
  pathParameters: {
    proxy: '/path/to/resource',
  },
  headers: {},
  multiValueHeaders: {},
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {
    authorizer: null,
    accountId: '123456789012',
    resourceId: '123456',
    stage: 'prod',
    requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
    requestTime: '09/Apr/2015:12:34:56 +0000',
    requestTimeEpoch: 1428582896000,
    identity: {
      cognitoIdentityPoolId: null,
      accountId: null,
      cognitoIdentityId: null,
      caller: null,
      accessKey: null,
      sourceIp: '127.0.0.1',
      cognitoAuthenticationType: null,
      cognitoAuthenticationProvider: null,
      userArn: null,
      userAgent: 'Custom User Agent String',
      user: null,
      apiKey: null,
      apiKeyId: null,
      clientCert: null,
      principalOrgId: null,
    },
    path: '/prod/path/to/resource',
    resourcePath: '/{proxy+}',
    httpMethod: 'POST',
    apiId: '1234567890',
    protocol: 'HTTP/1.1',
  },
}
const DEFAULT_CONTEXT = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: '',
  functionVersion: '',
  invokedFunctionArn: '',
  memoryLimitInMB: '',
  awsRequestId: '',
  logGroupName: '',
  logStreamName: '',
  getRemainingTimeInMillis: () => 0,
  done: () => {},
  fail: () => {},
  succeed: () => {},
}

const secretsManagerMock = mockClient(SecretsManagerClient)

const response401 = {
  statusCode: 401,
  body: '',
  headers: { 'access-control-allow-origin': '*' },
}

test.beforeEach(() => {
  secretsManagerMock.reset()
  apiKeys.clear()
})

test.serial('authenticate cases', async (t) => {
  secretsManagerMock
    .on(GetSecretValueCommand)
    .resolves({ SecretString: JSON.stringify({ ABC: 'read', DEF: 'other' }) })

  const event = { ...DEFAULT_EVENT }
  const context = { ...DEFAULT_CONTEXT }

  // no credentials
  t.deepEqual(await handler(event, context), response401)

  // invalid credentials
  event.headers['Authorization'] = 'Bearer invalid'
  t.deepEqual(await handler(event, context), response401)

  // valid credentials
  event.headers['Authorization'] = 'Bearer ABC'
  t.deepEqual(await handler(event, context), event)

  delete event.headers['Authorization']

  // credentials don't have read permissions
  event.headers['Authorization'] = 'Bearer DEF'
  t.deepEqual(await handler(event, context), response401)

  delete event.headers['Authorization']

  // invalid credentials
  event.queryStringParameters['auth_token'] = 'invalid'
  t.deepEqual(await handler(event, context), response401)

  // valid credentials
  event.queryStringParameters['auth_token'] = 'ABC'
  t.deepEqual(await handler(event, context), event)
})

test.serial('authenticate failure with retrieving keys', async (t) => {
  secretsManagerMock.on(GetSecretValueCommand).rejectsOnce('mocked rejection')

  const event = { ...DEFAULT_EVENT }
  const context = { ...DEFAULT_CONTEXT }

  t.deepEqual(await handler(event, context), response401)
})
