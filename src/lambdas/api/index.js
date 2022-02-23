// @ts-check

const serverless = require('serverless-http')
const { app } = require('./app')

/**
 * @typedef {import('aws-lambda').APIGatewayProxyEvent} APIGatewayProxyEvent
 * @typedef {import('aws-lambda').Context} Context
 */

/**
 * @param {APIGatewayProxyEvent} event
 * @param {Context} context
 * @returns {Promise<unknown>}
 */
const handler = async (event, context) => {
  const validPath = event.pathParameters === null
    ? '/'
    : `/${event.pathParameters['proxy']}`

  const validEvent = {
    ...event,
    path: validPath
  }

  return serverless(app)(validEvent, context)
}

module.exports = { handler }
