/* eslint-disable import/prefer-default-export */

/**
 * To Do
 *
 * - `invokePreHook` and `invokePostHook` are very similar. They should be DRY'd up.
 */

import { z } from 'zod'
import serverless from 'serverless-http'
import { Lambda } from 'aws-sdk'
import { app } from './app.js'
import _default from './types.js'
import logger from '../../lib/logger.js'

/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
const {
  APIGatewayProxyResultSchema, PreHookResultSchema, PostHookResultSchema,
  LambdaErrorSchema,
  APIGatewayProxyEventSchema
} = _default
/* eslint-enable no-unused-vars */
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * @typedef {import('aws-lambda').APIGatewayProxyEvent} APIGatewayProxyEvent
 * @typedef {import('aws-lambda').APIGatewayProxyResult} APIGatewayProxyResult
 * @typedef {import('aws-lambda').Context} Context
 * @typedef {z.infer<typeof LambdaErrorSchema>} LambdaError
 */

/** @type {APIGatewayProxyResult} */
const internalServerError = Object.freeze({
  statusCode: 500,
  headers: {
    'content-type': 'text/plain'
  },
  body: 'Internal Server Error'
})

/**
 * @param {unknown} data
 * @param {unknown} error
 * @returns {void}
 */
const logZodParseError = (data, error) => {
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

/**
 * @param {any} lambda
 * @param {string} preHook
 * @param {APIGatewayProxyEvent} payload
 * @returns {Promise<APIGatewayProxyEvent|APIGatewayProxyResult>}
 */
const invokePreHook = async (lambda, preHook, payload) => {
  /** @type {Lambda.InvocationResponse} */
  let invocationResponse
  try {
    invocationResponse = await lambda.invoke({
      FunctionName: preHook,
      Payload: JSON.stringify(payload)
    }).promise()
  } catch (error) {
    logger.error('Failed to invoke pre-hook lambda:', error)
    return internalServerError
  }

  // I've never seen this happen but, according to the TypeScript type definitions
  // provided by AWS, `Lambda.InvocationResponse.Payload` could be `undefined`.
  if (invocationResponse.Payload === undefined) {
    logger.error('Undefined Payload returned from pre-hook lambda')
    return internalServerError
  }

  const rawHookResult = JSON.parse(invocationResponse.Payload.toString())

  /** @type {APIGatewayProxyEvent|APIGatewayProxyResult|LambdaError} */
  let hookResult
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

/**
 * @param {any} lambda
 * @param {string} postHook
 * @param {APIGatewayProxyResult} payload
 * @returns {Promise<APIGatewayProxyResult>}
 */
const invokePostHook = async (lambda, postHook, payload) => {
  /** @type {Lambda.InvocationResponse} */
  let invocationResponse
  try {
    invocationResponse = await lambda.invoke({
      FunctionName: postHook,
      Payload: JSON.stringify(payload)
    }).promise()
  } catch (error) {
    logger.error('Failed to invoke post-hook lambda:', error)
    return internalServerError
  }

  // I've never seen this happen but, according to the TypeScript type definitions
  // provided by AWS, `Lambda.InvocationResponse.Payload` could be `undefined`.
  if (invocationResponse.Payload === undefined) {
    logger.error('Undefined Payload returned from post-hook lambda')
    return internalServerError
  }

  const rawHookResult = JSON.parse(invocationResponse.Payload.toString())

  /** @type {APIGatewayProxyResult|LambdaError} */
  let hookResult
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

/**
 * @param {APIGatewayProxyEvent} event
 * @param {Context} context
 * @returns {Promise<APIGatewayProxyResult>}
 */
const callServerlessApp = async (event, context) => {
  const result = await serverless(app)(event, context)

  try {
    return APIGatewayProxyResultSchema.parse(result)
  } catch (error) {
    logger.error('Failed to parse response from serverless app')
    logZodParseError(result, error)
    return internalServerError
  }
}

/**
 *
 * @param {unknown} rawEvent
 * @returns {APIGatewayProxyEvent}
 */
const parseEvent = (rawEvent) => {
  const event = APIGatewayProxyEventSchema.parse(rawEvent)

  /** @type {string} */
  let validPath
  if (event.pathParameters === null) {
    validPath = '/'
  } else if ('proxy' in event.pathParameters) {
    validPath = `/${event.pathParameters['proxy']}`
  } else {
    throw new Error('Unable to determine path from event')
  }

  // @ts-expect-error https://github.com/colinhacks/zod/issues/980
  return { ...event, path: validPath }
}

/**
 * @param {APIGatewayProxyEvent} event
 * @param {Context} context
 * @returns {Promise<APIGatewayProxyResult>}
 */

export const handler = async (event, context) => {
  if (!process.env['AWS_REGION']) {
    logger.error('AWS_REGION not set')
    return internalServerError
  }

  const lambda = new Lambda({ region: process.env['AWS_REGION'] })

  /** @type {APIGatewayProxyEvent} */
  let parsedEvent
  try {
    parsedEvent = parseEvent(event)
  } catch (error) {
    logZodParseError(event, error)
    return internalServerError
  }

  /** @type {APIGatewayProxyEvent|APIGatewayProxyResult} */
  const serverlessAppEvent = process.env['PRE_HOOK']
    ? await invokePreHook(lambda, process.env['PRE_HOOK'], parsedEvent)
    : parsedEvent

  if ('statusCode' in serverlessAppEvent) return serverlessAppEvent

  const serverlessAppResult = await callServerlessApp(serverlessAppEvent, context)

  return process.env['POST_HOOK']
    ? await invokePostHook(lambda, process.env['POST_HOOK'], serverlessAppResult)
    : serverlessAppResult
}
