import { connect, createIndex } from '../../src/lib/databaseClient'

export const createCollectionsIndex: () => Promise<void> = async () => {
  await createIndex('collections')
}

export const refreshIndices: () => Promise<void> = async () => {
  const client = await connect()
  // @ts-expect-error client can be of two types with the same API
  await client.indices.refresh({ index: '_all' })
}

export const deleteAllIndices: () => Promise<void> = async () => {
  const client = await connect()
  // @ts-expect-error client can be of two types with the same API
  await client.indices.delete({ index: '_all' })
  await refreshIndices()
}
