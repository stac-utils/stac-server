/**
 * Shared types for test files.
 *
 * These types model the shapes that system tests commonly assert against,
 * such as parsed JSON response bodies from Got and HTTP error responses.
 * They are intentionally lightweight partials — just enough to satisfy
 * test assertions without duplicating the full STAC spec types.
 */

import type { Response } from 'got'
import type {
  Link,
  Assets,
  StacCollection,
  StacItem,
  Aggregation,
  Queryables,
} from '../../src/lib/types.js'

// Re-export for convenience in test files
export type { ExecutionContext, TestFn } from 'ava'

// ---------------------------------------------------------------------------
// Got response body shapes
// ---------------------------------------------------------------------------

/**
 * Convenience alias for a Got Response whose body has been parsed as JSON.
 * The api test client is configured with `responseType: 'json'`, so `body`
 * is already parsed — this generic lets tests specify the expected shape.
 */
export type JsonResponse<T = unknown> = Response<T>

/**
 * Common body shape returned by the root / landing page endpoint.
 */
export interface RootBody {
  id: string
  type: string
  title: string
  description: string
  stac_version: string
  conformsTo: string[]
  links: Link[]
}

/**
 * Body shape returned by the GET /collections endpoint.
 */
export interface CollectionsBody {
  collections: StacCollection[]
  links: Link[]
  numberMatched?: number
  numberReturned?: number
}

/**
 * Body shape returned by search endpoints (GET/POST /search,
 * GET /collections/:id/items).
 */
export interface SearchBody {
  type: string
  features: StacItem[]
  links: Link[]
  numberMatched?: number
  numberReturned?: number
  context?: Record<string, unknown>
}

/**
 * Body shape returned by a single item endpoint
 * (GET /collections/:id/items/:itemId).
 */
export interface ItemBody {
  type: string
  id: string
  collection: string
  geometry: Record<string, unknown> | null
  bbox?: number[]
  properties: Record<string, unknown>
  links: Link[]
  assets: Assets
  stac_version: string
  stac_extensions?: string[]
}

/**
 * Body shape returned by the queryables endpoint.
 * Re-exported from Queryables in src/lib/types.ts which covers:
 *   $schema, $id, type, title, description?,
 *   additionalProperties, properties
 */
export type QueryablesBody = Queryables

/**
 * Body shape returned by the aggregations endpoint.
 */
export interface AggregationsBody {
  aggregations: Aggregation[]
  links: Link[]
}

/**
 * Body shape returned by the aggregate endpoint.
 */
export interface AggregateBody {
  type: string
  aggregations: Aggregation[]
}

/**
 * Body shape returned by the conformance endpoint.
 */
export interface ConformanceBody {
  conformsTo: string[]
}

/**
 * Body shape for a single collection response.
 */
export type CollectionBody = StacCollection

// ---------------------------------------------------------------------------
// Error response shapes
// ---------------------------------------------------------------------------

/**
 * Shape of the parsed JSON body on an HTTP error response from the API.
 * Used when catching Got `HTTPError` instances in tests.
 */
export interface ApiErrorBody {
  code: string
  description: string
}

/**
 * Shape of a Got `HTTPError` with a JSON-parsed response body.
 * For use with `t.throwsAsync()` — cast the result to this type or
 * import `HTTPError` from `got` directly and narrow with `instanceof`.
 */
export interface ApiHttpError extends Error {
  response: {
    statusCode: number
    body: ApiErrorBody
  }
}

// ---------------------------------------------------------------------------
// Asset proxy response shapes
// ---------------------------------------------------------------------------

/**
 * Shape of an item body where assets may contain `alternate` links
 * with proxy URLs, as returned when the asset proxy is enabled.
 */
export interface ProxiedItemBody extends ItemBody {
  assets: Assets & {
    [key: string]: {
      href: string
      alternate?: {
        [key: string]: {
          href: string
          title?: string
        }
      }
    }
  }
}
