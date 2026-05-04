import got from 'got' // eslint-disable-line import/no-unresolved
import type {
  OptionsOfJSONResponseBody,
  OptionsInit,
  Response,
  CancelableRequest,
} from 'got'
import { once } from 'events'
import type { Application } from 'express'
import type { StacCollection, StacItem } from '../../src/lib/types.js'
import { createApp } from '../../src/lambdas/api/app.js'

// ---------------------------------------------------------------------------
// Typed API client
// ---------------------------------------------------------------------------

/**
 * A narrowed Got-like interface whose methods default to JSON
 * response bodies (typed as Record<string, any>) rather than `string`.
 *
 * When called with `resolveBodyOnly: false`, returns `Response<Body>`.
 * When called with `resolveBodyOnly: true` (the configured default),
 * returns `Body` directly.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
interface TypedRequestFn {
  (url: string, options: OptionsInit &
    { resolveBodyOnly: false; responseType: 'text' })
    : CancelableRequest<Response<string>>
  (url: string, options: OptionsOfJSONResponseBody & { resolveBodyOnly: false })
    : CancelableRequest<Response<any>>
  (url: string, options?: OptionsOfJSONResponseBody)
    : CancelableRequest<any>
}

export interface TypedApiClient {
  get: TypedRequestFn
  post: TypedRequestFn
  put: TypedRequestFn
  patch: TypedRequestFn
  delete: TypedRequestFn
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const apiClient = (url: string): TypedApiClient => got.extend({
  prefixUrl: url,
  headers: {
    'X-Forwarded-Proto': 'http'
  },
  responseType: 'json',
  resolveBodyOnly: true
}) as unknown as TypedApiClient

export interface ApiInstance {
  app: Application
  client: TypedApiClient
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

export const getCollectionIds = async (
  client: TypedApiClient
): Promise<string[]> => {
  const response = await client.get('collections')
  return response.collections.map((c: StacCollection) => c.id)
}

const getCollection = async (
  client: TypedApiClient,
  collectionId: string
): Promise<StacCollection> =>
  client.get(`collections/${collectionId}`)

export const getItem = async (
  client: TypedApiClient,
  collectionId: string,
  itemId: string
): Promise<StacItem> =>
  client.get(`collections/${collectionId}/items/${itemId}`)

export default {
  getCollection,
  getItem,
  getCollectionIds,
  startApi
}
