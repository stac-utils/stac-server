import { connect, createIndex } from '../../src/lib/database-client.js'

export const createCollectionsIndex = async (): Promise<void> => {
  await createIndex('collections')
}

export const refreshIndices = async (): Promise<void> => {
  const client = await connect()
  await client.indices.refresh({ index: '_all' })
}

export const deleteAllIndices = async (): Promise<void> => {
  const client = await connect()
  await client.indices.delete({ index: '_all' })
  await refreshIndices()
}
