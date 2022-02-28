// @ts-check

const { default: got } = require('got')
const { once } = require('events')
const { app } = require('../../src/lambdas/api/app')

/**
 * @typedef {import('got').Got} Got
 */

/**
 * @param {string} url
 * @returns {Got}
 */
const apiClient = (url) => got.extend({
  prefixUrl: url,
  headers: {
    'X-Forwarded-Proto': 'http'
  },
  responseType: 'json',
  resolveBodyOnly: true
})

/**
 * @typedef {Object} ApiInstance
 * @property {Got} client
 * @property {() => Promise<void>} close
 * @property {string} url
 */

/**
 * @returns {Promise<ApiInstance>}
 */
const startApi = async () => {
  const server = app.listen(0, '127.0.0.1')

  await once(server, 'listening')

  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error(`Unexpected address: ${address}`)
  }

  const url = `http://${address.address}:${address.port}`

  const client = apiClient(url)

  const close = async () => {
    server.close()
    await once(server, 'close')
  }

  return Object.freeze({
    client,
    close,
    url
  })
}

/**
 * @param {Got} client
 * @returns {Promise<string[]>}
 */
const getCollectionIds = async (client) => {
  const response = await client.get('collections')

  // @ts-expect-error We need to be validating this response
  return response.collections.map((c) => c.id)
}

/**
 * @param {Got} client
 * @param {string} collectionId
 * @returns {Promise<unknown>}
 */
const getCollection = async (client, collectionId) =>
  client.get(`collections/${collectionId}`)

/**
 * @param {Got} client
 * @param {string} collectionId
 * @param {string} itemId
 * @returns {Promise<unknown>}
 */
const getItem = async (client, collectionId, itemId) =>
  client.get(`collections/${collectionId}/items/${itemId}`)

module.exports = {
  getCollection,
  getItem,
  getCollectionIds,
  startApi
}
