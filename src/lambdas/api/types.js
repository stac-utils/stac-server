// @ts-check

const { z } = require('zod')

const NumberOrUndefined = z.union([z.number(), z.undefined()])
const StringArrayOrUndefined = z.union([z.array(z.string()), z.undefined()])
const StringArrayOrUndefinedObject = z.object({}).catchall(StringArrayOrUndefined)
const StringOrNull = z.union([z.string(), z.null()])
const StringOrUndefined = z.union([z.string(), z.undefined()])
const StringOrUndefinedObject = z.object({}).catchall(StringOrUndefined)

const APIGatewayEventClientCertificate = z.object({
  clientCertPem: z.string(),
  serialNumber: z.string(),
  subjectDN: z.string(),
  issuerDN: z.string(),
  validity: z.object({
    notAfter: z.string(),
    notBefore: z.string(),
  })
})

const APIGatewayEventIdentity = z.object({
  accessKey: StringOrNull,
  accountId: StringOrNull,
  apiKey: StringOrNull.optional(),
  apiKeyId: StringOrNull.optional(),
  caller: StringOrNull,
  clientCert: z.union([APIGatewayEventClientCertificate, z.null()]).optional(),
  cognitoAuthenticationProvider: StringOrNull,
  cognitoAuthenticationType: StringOrNull,
  cognitoIdentityId: StringOrNull,
  cognitoIdentityPoolId: StringOrNull,
  principalOrgId: StringOrNull.optional(),
  sourceIp: z.string(),
  user: StringOrNull,
  userAgent: StringOrNull,
  userArn: StringOrNull,
})

const APIGatewayEventDefaultAuthorizerContext = z.union([
  z.undefined(),
  z.null(),
  z.object({}).catchall(z.any())
])

const APIGatewayEventRequestContext = z.object({
  accountId: z.string(),
  apiId: z.string(),
  authorizer: APIGatewayEventDefaultAuthorizerContext,
  connectedAt: NumberOrUndefined.optional(),
  connectionId: StringOrUndefined.optional(),
  domainName: StringOrUndefined.optional(),
  domainPrefix: StringOrUndefined.optional(),
  eventType: StringOrUndefined.optional(),
  extendedRequestId: StringOrUndefined.optional(),
  protocol: z.string(),
  httpMethod: z.string(),
  identity: APIGatewayEventIdentity,
  messageDirection: StringOrUndefined.optional(),
  messageId: z.union([z.string(), z.null(), z.undefined()]).optional(),
  path: z.string(),
  stage: z.string(),
  requestId: z.string(),
  requestTime: StringOrUndefined.optional(),
  requestTimeEpoch: z.number(),
  resourceId: z.string(),
  resourcePath: z.string(),
  routeKey: StringOrUndefined.optional()
})

const APIGatewayProxyEventSchema = z.object({
  body: StringOrNull,
  headers: StringOrUndefinedObject,
  multiValueHeaders: StringArrayOrUndefinedObject,
  httpMethod: z.string(),
  isBase64Encoded: z.boolean(),
  path: z.string(),
  pathParameters: z.union([StringOrUndefinedObject, z.null()]),
  queryStringParameters: z.union([StringOrUndefinedObject, z.null()]),
  multiValueQueryStringParameters: z.union([StringArrayOrUndefinedObject, z.null()]),
  stageVariables: z.union([StringOrUndefinedObject, z.null()]),
  requestContext: APIGatewayEventRequestContext,
  resource: z.string()
})

const APIGatewayProxyResultSchema = z.object({
  statusCode: z.number().positive().int(),
  headers: z.object({}).catchall(z.string()).optional(),
  multiValueHeaders: z.object({}).catchall(z.array(z.string())).optional(),
  body: z.string(),
  isBase64Encoded: z.boolean().optional()
})

const LambdaErrorSchema = z.object({
  errorType: z.string(),
  errorMessage: z.string(),
  trace: z.array(z.string())
})

const PreHookResultSchema = z.union([
  APIGatewayProxyEventSchema,
  APIGatewayProxyResultSchema,
  LambdaErrorSchema
])

const PostHookResultSchema = z.union([
  APIGatewayProxyResultSchema,
  LambdaErrorSchema
])

module.exports = {
  APIGatewayProxyEventSchema,
  APIGatewayProxyResultSchema,
  LambdaErrorSchema,
  PostHookResultSchema,
  PreHookResultSchema,
}
