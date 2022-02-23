// @ts-check

const { connect, createIndex } = require('../../src/lib/esClient')

/**
 * @returns {Promise<void>}
 */
const createCollectionsIndex = async () => {
  await createIndex('collections')
}

/**
 * @returns {Promise<void>}
 */
const refreshIndices = async () => {
  const esClient = await connect()
  await esClient.indices.refresh({ index: '_all' })
}

module.exports = {
  createCollectionsIndex,
  refreshIndices
}
