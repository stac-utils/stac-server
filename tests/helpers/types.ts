/**
 * Shared types for test files.
 *
 * Only types that are actually used in test assertions live here.
 * For STAC domain types (StacItem, StacCollection, Link, etc.),
 * import directly from '../../src/lib/types.js'.
 */

import type {
  StacItem,
  Link,
} from '../../src/lib/types.js'

// Re-export for convenience in test files
export type { ExecutionContext, TestFn } from 'ava'

// ---------------------------------------------------------------------------
// Search response shape
// ---------------------------------------------------------------------------

/**
 * Body shape returned by search endpoints (GET/POST /search,
 * GET /collections/:id/items).
 * Kept as a test-specific type because it includes the `context` field
 * and represents a search-specific response distinct from StacApiResult.
 */
export interface SearchBody {
  type: string
  features: StacItem[]
  links: Link[]
  numberMatched?: number
  numberReturned?: number
  context?: Record<string, unknown>
}

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
