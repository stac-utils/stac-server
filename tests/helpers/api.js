import got from 'got' // eslint-disable-line import/no-unresolved
import { once } from 'events'
import { createApp } from '../../src/lambdas/api/app.js'

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
 * @property {import('express').Application} app
 * @property {Got} client
 * @property {() => Promise<void>} close
 * @property {string} url
 */

/**
 * @returns {Promise<ApiInstance>}
 */
export const startApi = async () => {
  const app = await createApp()
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
    app,
    client,
    close,
    url
  })
}

/**
 * @param {Got} client
 * @returns {Promise<string[]>}
 */
export const getCollectionIds = async (client) => {
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
export const getItem = async (client, collectionId, itemId) =>
  client.get(`collections/${collectionId}/items/${itemId}`)

export default {
  getCollection,
  getItem,
  getCollectionIds,
  startApi
}
