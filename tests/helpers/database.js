import { connect, createIndex } from '../../src/lib/database-client.js'

/**
 * @returns {Promise<void>}
 */
export const createCollectionsIndex = async () => {
  await createIndex('collections')
}

/**
 * @returns {Promise<void>}
 */
export const refreshIndices = async () => {
  const client = await connect()
  await client.indices.refresh({ index: '_all' })
}

/**
 * @returns {Promise<void>}
 */
export const deleteAllIndices = async () => {
  const client = await connect()
  await client.indices.delete({ index: '_all' })
  await refreshIndices()
}
