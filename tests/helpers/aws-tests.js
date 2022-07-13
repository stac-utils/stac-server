// @ts-check

const nock = require('nock')

const disableNetConnect = () => {
  nock.disableNetConnect()
  nock.enableNetConnect(/127\.0\.0\.1|localhost|lambda.us-east-1.amazonaws.com/)
}

const event = Object.freeze({
  body: null,
  resource: '/{proxy+}',
  path: '/',
  httpMethod: 'GET',
  isBase64Encoded: true,
  queryStringParameters: {},
  multiValueQueryStringParameters: {},
  pathParameters: {
    proxy: ''
  },
  stageVariables: {},
  headers: {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip',
  },
  multiValueHeaders: {
    Accept: ['application/json'],
    'Accept-Encoding': ['gzip'],
  },
  requestContext: {
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
      user: null
    },
    path: '/prod/',
    resourcePath: '/{proxy+}',
    httpMethod: 'GET',
    apiId: '1234567890',
    protocol: 'HTTP/1.1'
  }
})

module.exports = {
  disableNetConnect,
  event
}
