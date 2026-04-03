/**
 * To Do
 *
 * - `invokePreHook` and `invokePostHook` are very similar. They should be DRY'd up.
 */

import { z } from 'zod'
import serverless from 'serverless-http'
import { InvocationResponse, Lambda } from '@aws-sdk/client-lambda'
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'
import { createApp } from './app.js'
import _default, { LambdaError } from './types.js'
import logger from '../../lib/logger.js'

const {
  APIGatewayProxyResultSchema, PreHookResultSchema, PostHookResultSchema,
  APIGatewayProxyEventSchema
} = _default

const internalServerError = Object.freeze({
  statusCode: 500,
  headers: {
    'content-type': 'text/plain'
  },
  body: 'Internal Server Error'
}) as APIGatewayProxyResult

const logZodParseError = (
  data: unknown,
  error: unknown
) => {
  let errorObj
  if (error instanceof z.ZodError) {
    errorObj = { data, issues: error.issues }
  } else if (error instanceof Error) {
    errorObj = {
      data,
      error: {
        name: error.name,
        message: error.message
      }
    }
  } else {
    errorObj = { data, error }
  }

  logger.error('zod parsing error: %j', errorObj)
}

const invokePreHook = async (
  lambda: Lambda,
  preHook: string,
  payload: APIGatewayProxyEvent
): Promise<APIGatewayProxyEvent|APIGatewayProxyResult> => {
  let invocationResponse: InvocationResponse
  try {
    invocationResponse = await lambda.invoke({
      FunctionName: preHook,
      Payload: JSON.stringify(payload)
    })
  } catch (error) {
    logger.error('Failed to invoke pre-hook lambda:', error)
    return internalServerError
  }

  // I've never seen this happen but, according to the TypeScript type definitions
  // provided by AWS, `InvocationResponse.Payload` could be `undefined`.
  if (invocationResponse.Payload === undefined) {
    logger.error('Undefined Payload returned from pre-hook lambda')
    return internalServerError
  }

  const rawHookResult = JSON.parse(invocationResponse.Payload.toString())

  let hookResult: APIGatewayProxyEvent|APIGatewayProxyResult | LambdaError
  try {
    // @ts-expect-error https://github.com/colinhacks/zod/issues/980
    hookResult = PreHookResultSchema.parse(rawHookResult)
  } catch (error) {
    logger.error('Failed to parse response from pre-hook')
    logZodParseError(rawHookResult, error)
    return internalServerError
  }

  if ('errorType' in hookResult) {
    logger.error('Pre-hook failed:', hookResult)
    return internalServerError
  }

  return hookResult
}

const invokePostHook = async (
  lambda: Lambda,
  postHook: string,
  payload: APIGatewayProxyResult
): Promise<APIGatewayProxyResult> => {
  let invocationResponse: InvocationResponse
  try {
    invocationResponse = await lambda.invoke({
      FunctionName: postHook,
      Payload: JSON.stringify(payload)
    })
  } catch (error) {
    logger.error('Failed to invoke post-hook lambda:', error)
    return internalServerError
  }

  // handled per official type, though extremely uncommon
  if (invocationResponse.Payload === undefined) {
    logger.error('Undefined Payload returned from post-hook lambda')
    return internalServerError
  }

  const rawHookResult = JSON.parse(invocationResponse.Payload.toString())

  let hookResult: APIGatewayProxyResult | LambdaError
  try {
    hookResult = PostHookResultSchema.parse(rawHookResult)
  } catch (error) {
    logger.error('Failed to parse response from post-hook')
    logZodParseError(rawHookResult, error)
    return internalServerError
  }

  if ('errorType' in hookResult) {
    logger.error('Post hook failed:', hookResult)
    return internalServerError
  }

  return hookResult
}

const callServerlessApp = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const appInstance = await createApp()

  const result = await serverless(appInstance)(event, context)

  try {
    return APIGatewayProxyResultSchema.parse(result)
  } catch (error) {
    logger.error('Failed to parse response from serverless app')
    logZodParseError(result, error)
    return internalServerError
  }
}

const parseEvent = (
  rawEvent: APIGatewayProxyEvent
): APIGatewayProxyEvent => {
  const event = APIGatewayProxyEventSchema.parse(rawEvent)

  let validPath: string
  if (event.pathParameters === null) {
    validPath = '/'
  } else if ('proxy' in event.pathParameters) {
    validPath = `/${event.pathParameters['proxy']}`
  } else {
    throw new Error('Unable to determine path from event')
  }

  // cast due to TS issue, validated by zod https://github.com/colinhacks/zod/issues/980
  return { ...event, path: validPath } as APIGatewayProxyEvent
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  if (!process.env['AWS_REGION']) {
    logger.error('AWS_REGION not set')
    return internalServerError
  }

  const lambda = new Lambda({ region: process.env['AWS_REGION'] })

  let parsedEvent: APIGatewayProxyEvent
  try {
    parsedEvent = parseEvent(event)
  } catch (error) {
    logZodParseError(event, error)
    return internalServerError
  }

  const serverlessAppEvent: APIGatewayProxyEvent | APIGatewayProxyResult = process.env['PRE_HOOK']
    ? await invokePreHook(lambda, process.env['PRE_HOOK'], parsedEvent)
    : parsedEvent

  if ('statusCode' in serverlessAppEvent) return serverlessAppEvent

  const serverlessAppResult = await callServerlessApp(serverlessAppEvent, context)

  return process.env['POST_HOOK']
    ? await invokePostHook(lambda, process.env['POST_HOOK'], serverlessAppResult)
    : serverlessAppResult
}
