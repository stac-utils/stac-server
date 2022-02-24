// @ts-check

const { default: got } = require('got')

const apiClient = got.extend({
  prefixUrl: 'http://localhost:3000/',
  headers: {
    'X-Forwarded-Proto': 'http'
  },
  responseType: 'json',
  resolveBodyOnly: true
})

const getCollectionIds = async () => {
  const response = await apiClient.get('collections')

  // @ts-expect-error We need to be validating this response
  return response.collections.map((c) => c.id)
}

/**
 * @param {string} collectionId
 * @returns {Promise<unknown>}
 */
const getCollection = async (collectionId) =>
  apiClient.get(`collections/${collectionId}`)

/**
 * @param {string} collectionId
 * @param {string} itemId
 * @returns {Promise<unknown>}
 */
const getItem = async (collectionId, itemId) =>
  apiClient.get(`collections/${collectionId}/items/${itemId}`)

module.exports = {
  apiClient,
  getCollection,
  getItem,
  getCollectionIds
}
