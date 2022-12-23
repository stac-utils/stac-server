const { connect, createIndex } = require('../../src/lib/databaseClient')

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
  const client = await connect()
  // @ts-expect-error client can be of two types with the same API
  await client.indices.refresh({ index: '_all' })
}

/**
 * @returns {Promise<void>}
 */
const deleteAllIndices = async () => {
  const client = await connect()
  // @ts-expect-error client can be of two types with the same API
  await client.indices.delete({ index: '_all' })
  await refreshIndices()
}

module.exports = {
  createCollectionsIndex,
  deleteAllIndices,
  refreshIndices
}
