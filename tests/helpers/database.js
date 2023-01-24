import { connect, createIndex } from '../../src/lib/databaseClient.js'

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
  // @ts-expect-error client can be of two types with the same API
  await client.indices.refresh({ index: '_all' })
}

/**
 * @returns {Promise<void>}
 */
export const deleteAllIndices = async () => {
  const client = await connect()
  // @ts-expect-error client can be of two types with the same API
  await client.indices.delete({ index: '_all' })
  await refreshIndices()
}
