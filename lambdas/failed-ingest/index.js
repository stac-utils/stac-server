'use strict'

const AWS = require('aws-sdk')
const logger = console

module.exports.handler = async function handler(event) {
  logger.debug(`Failed ingest: ${JSON.stringify(event)}`)
}

