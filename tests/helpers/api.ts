import got, { Got } from 'got' // eslint-disable-line import/no-unresolved
import { once } from 'events'
import type { Application } from 'express'
import { createApp } from '../../src/lambdas/api/app.js'

const apiClient = (url: string): Got => got.extend({
  prefixUrl: url,
  headers: {
    'X-Forwarded-Proto': 'http'
  },
  responseType: 'json',
  resolveBodyOnly: true
})

export interface ApiInstance {
  app: Application
  client: Got
  close: () => Promise<void>
  url: string
}

export const startApi = async (): Promise<ApiInstance> => {
  const app = await createApp()
  const server = app.listen(0, '127.0.0.1')

  await once(server, 'listening')

  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error(`Unexpected address: ${address}`)
  }

  const url = `http://${address.address}:${address.port}`

  const client = apiClient(url)

  const close = async (): Promise<void> => {
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

export const getCollectionIds = async (client: Got): Promise<string[]> => {
  const response = await client.get('collections')

  // @ts-expect-error We need to be validating this response
  return response.collections.map((c) => c.id)
}

const getCollection = async (client: Got, collectionId: string): Promise<unknown> =>
  client.get(`collections/${collectionId}`)

export const getItem = async (
  client: Got,
  collectionId: string,
  itemId: string
): Promise<unknown> =>
  client.get(`collections/${collectionId}/items/${itemId}`)

export default {
  getCollection,
  getItem,
  getCollectionIds,
  startApi
}
