# Milestone 5.1.0 Issue Review

This document reviews the status of each issue assigned to the
[5.1.0 milestone](https://github.com/stac-utils/stac-server/milestone/19) as of
March 2026. The goal is to assess whether any issues have already been completed,
are no longer relevant, or remain open and actionable.

---

## Summary Table

| Issue | Title | Assessment |
|-------|-------|------------|
| [#870](#870-implement-collection-search-support) | Implement collection search support | 🔵 Still Open |
| [#867](#867-upgrade-express-to-5x) | Upgrade Express to 5.x | 🔵 Still Open |
| [#864](#864-add-support-for-hidden-filter-in-aggregation-endpoints) | Add support for "hidden" filter in aggregation endpoints | ✅ Already Completed |
| [#863](#863-add-support-for-hidden-filter-in-search-endpoints) | Add support for "hidden" filter in search endpoints | ✅ Already Completed |
| [#851](#851-filter-extension-add-support-for-like-operator) | Filter Extension: Add support for LIKE operator | 🔵 Still Open |
| [#839](#839-upgrade-dependency-opensearch-projectopensearch-from-2x-to-340) | Upgrade @opensearch-project/opensearch from 2.x to ^3.4.0 | 🔵 Still Open |
| [#830](#830-better-log-message-needed-when-updating-an-existing-collection-record) | Better log message needed when updating an existing collection record | 🔵 Still Open |
| [#823](#823-pagination-links-not-included-if-sortby-field-is-excluded-from-search-results) | Pagination links not included if sortby field is excluded | ✅ Already Completed |
| [#666](#666-tests-timeout-when-running-with-ava-60) | tests timeout when running with ava 6.0 | 🟡 OBE / No Longer Relevant |
| [#652](#652-document-using-iam-auth-and-opensearch-serverless) | Document using IAM auth and OpenSearch Serverless | 🔵 Still Open |
| [#530](#530-search_after-has-1-values-but-sort-has-3) | search_after has 1 value(s) but sort has 3 | ✅ Likely Completed |
| [#449](#449-implement-aggregations-extension-post-endpoints) | Implement Aggregations Extension POST endpoints | 🔵 Still Open |
| [#363](#363-ingest-should-distinguish-items-and-collections-by-type) | ingest should distinguish items and collections by type | ✅ Already Closed |
| [#212](#212-consider-returning-200-with-item-for-put-patch-and-post-txn-endpoints) | Consider returning 200 with Item for PUT, PATCH, and POST txn endpoints | 🔵 Still Open |
| [#206](#206-typescript-migration) | TypeScript Migration | 🔵 Still Open (Partial) |

**Legend:**
- ✅ Already Completed or Closed
- 🟡 OBE (Overtaken By Events) / No Longer Relevant
- 🔵 Still Open and Relevant

---

## Detailed Issue Assessments

### [#870: Implement collection search support](https://github.com/stac-utils/stac-server/issues/870)

**Status: 🔵 Still Open**

**Finding:** The [collection-search extension](https://github.com/stac-api-extensions/collection-search)
has not been implemented. The `GET /collections` handler in `src/lambdas/api/app.js` passes
the request query parameters to `api.getCollections()`, but that function does not apply any
CQL2 filter, free-text search, or sorting logic to the OpenSearch query—it simply returns all
collections. No POST `/collections` search endpoint exists either. This is a legitimate open item.

---

### [#867: Upgrade Express to 5.x](https://github.com/stac-utils/stac-server/issues/867)

**Status: 🔵 Still Open**

**Finding:** `package.json` still lists `"express": "^4.21.2"`. The issue was filed after
attempting the upgrade and discovering that Express 5.x uses
[`Object.create(null)`](https://github.com/expressjs/express/blob/5.x/lib/request.js) for
`req.params`, which does not inherit from `Object.prototype`, causing `.hasOwnProperty()`
calls throughout `src/lib/api.js` to throw `TypeError: params.hasOwnProperty is not a function`.
No PR has been merged to resolve this.

---

### [#864: Add support for "hidden" filter in aggregation endpoints for authorization restrictions](https://github.com/stac-utils/stac-server/issues/864)

**Status: ✅ Already Completed**

**Finding:** This was fully implemented in
[v4.4.0](https://github.com/stac-utils/stac-server/blob/main/CHANGELOG.md#440---2025-09-10)
(released 2025-09-10). The `extractRestrictionCql2Filter` function in `src/lib/api.js`
reads a `_filter` query/body parameter or a `STAC-Filter-Authx` header, ANDs it with the
user's own `filter` via `concatenateCql2Filters`, and never writes the restriction filter
back into pagination links. The `aggregate` function (which powers both
`GET /aggregate` and `GET /collections/{collectionId}/aggregate`) calls
`extractRestrictionCql2Filter(parameters, headers)` on every request. The feature is
gated by the `ENABLE_FILTER_AUTHX=true` environment variable.

**Recommendation:** Close this issue as completed.

---

### [#863: Add support for "hidden" filter in search endpoints for authorization restrictions](https://github.com/stac-utils/stac-server/issues/863)

**Status: ✅ Already Completed**

**Finding:** Implemented alongside #864 in
[v4.4.0](https://github.com/stac-utils/stac-server/blob/main/CHANGELOG.md#440---2025-09-10)
(released 2025-09-10). The same `extractRestrictionCql2Filter` function in `src/lib/api.js`
is called by the `searchItems` function, which handles `POST /search`, `GET /search`, and
`GET /collections/{collectionId}/items`. The restriction filter is ANDs into every query but
is never included in `next` or `prev` pagination link bodies, so callers cannot see or
tamper with the authorization constraint. The feature is gated by the
`ENABLE_FILTER_AUTHX=true` environment variable.

**Recommendation:** Close this issue as completed.

---

### [#851: Filter Extension: Add support for LIKE operator from Advanced Comparison Operators](https://github.com/stac-utils/stac-server/issues/851)

**Status: 🔵 Still Open**

**Finding:** The LIKE operator is explicitly stubbed out as unsupported. In
`src/lib/database.js`, the CQL2 operator `switch` block contains:

```javascript
case OP.LIKE:
  throw new ValidationError("The 'like' operator is not currently supported")
```

The `IN` and `BETWEEN` operators were added in
[v3.11.0](https://github.com/stac-utils/stac-server/blob/main/CHANGELOG.md#3110---2025-03-27),
but LIKE was deliberately deferred. Implementing it (via OpenSearch `regexp` queries) would
complete the `advanced-comparison-operators` conformance class.

---

### [#839: Upgrade dependency @opensearch-project/opensearch from 2.x to ^3.4.0](https://github.com/stac-utils/stac-server/issues/839)

**Status: 🔵 Still Open**

**Finding:** `package.json` still lists `"@opensearch-project/opensearch": "^2.13.0"`. The
v3.x release regenerated the JavaScript client from the OpenSearch API spec, which renamed
several parameters (e.g., `opType` → `op_type`). A manual attempt to upgrade broke system
tests, as documented in the issue. No PR has landed to complete this migration.

---

### [#830: Better log message needed when updating an existing collection record](https://github.com/stac-utils/stac-server/issues/830)

**Status: 🔵 Still Open**

**Finding:** `src/lib/database-client.js` line 93 still reads:

```javascript
} else {
  logger.error(`${index} already exists.`)
}
```

This `logger.error` fires every time a collection is re-ingested (its OpenSearch index
already exists), producing an alarming error-level log entry even though no failure has
occurred. The fix is straightforward: downgrade to `logger.debug` (or `logger.info`) and
improve the message to something like
`"Index for collection '${index}' already exists, skipping creation"`. No PR has addressed
this yet.

---

### [#823: Pagination links not included if sortby field is excluded from search results](https://github.com/stac-utils/stac-server/issues/823)

**Status: ✅ Already Completed**

**Finding:** Fixed in [v5.0.0](https://github.com/stac-utils/stac-server/blob/main/CHANGELOG.md#500)
via [PR #1046](https://github.com/stac-utils/stac-server/pull/1046) (merged 2026-02-27).

The root cause was that the old implementation derived the pagination cursor from the
*document source fields* (e.g., `properties.updated`). If the `fields` parameter excluded
that field, OpenSearch omitted it from `_source`, leaving no value to use as the cursor,
and so `lastItemSort` was null—causing no `next` link to be generated.

The fix changed `src/lib/database.js` to read the cursor from the `sort` array that
OpenSearch attaches to every hit (populated regardless of `_source` field selection):

```javascript
const lastItem = hits.at(-1)
let lastItemSort = null
if (lastItem && lastItem.sort) {
  lastItemSort = lastItem.sort.join(',')
}
```

**Recommendation:** Close this issue as completed.

---

### [#666: tests timeout when running with ava 6.0](https://github.com/stac-utils/stac-server/issues/666)

**Status: 🟡 OBE / No Longer Relevant**

**Finding:** `package.json` still pins `"ava": "^5.3"`. This issue was a pre-upgrade
tracking ticket for a breaking change in ava 6.0 (`process.exit()` is no longer called
automatically when worker threads finish, causing the test run to hang if any test file
leaves open handles). Because the project never upgraded to ava 6.0, the problem
described in the issue does not affect the current codebase. If an ava 6.0 upgrade is
not planned as part of 5.1.0, this ticket should be removed from the milestone (or
closed as "not planned").

**Recommendation:** Remove from the 5.1.0 milestone or close as "not planned".

---

### [#652: Document using IAM auth and OpenSearch Serverless](https://github.com/stac-utils/stac-server/issues/652)

**Status: 🔵 Still Open**

**Finding:** The *implementation* for AWS OpenSearch Serverless has existed since
[v3.1.0](https://github.com/stac-utils/stac-server/blob/main/CHANGELOG.md#310---2023-11-28)
(released 2023-11-28). In `src/lib/database-client.js`, the client auto-detects
`aoss.amazonaws.com` hosts and switches the SigV4 service name from `es` to `aoss`:

```javascript
service: host.endsWith('aoss.amazonaws.com') ? 'aoss' : 'es',
```

However, the *docs* (`docs/deployment/index.md`) cover IAM authentication only for the
standard AWS OpenSearch Service (managed domains). There is no documentation for
[AWS OpenSearch Serverless](https://aws.amazon.com/opensearch-service/features/serverless/),
which has a different set-up (data access policies, collection-level endpoints, no
fine-grained access control, etc.). A dedicated documentation section explaining how to
point stac-server at an OpenSearch Serverless collection is still missing.

---

### [#530: search_after has 1 value(s) but sort has 3](https://github.com/stac-utils/stac-server/issues/530)

**Status: ✅ Likely Completed**

**Finding:** This OpenSearch error occurred when the `search_after` array had fewer
elements than the sort array. The old pagination implementation built the cursor by
extracting field values from the last document's `_source`, which only stored values
for fields that the user explicitly requested. The default sort has three fields
(`properties.datetime`, `id`, `collection`); if any were absent from `_source` the
cursor ended up with fewer than three values.

The fix in [v5.0.0](https://github.com/stac-utils/stac-server/blob/main/CHANGELOG.md#500)
via [PR #1046](https://github.com/stac-utils/stac-server/pull/1046) (merged 2026-02-27)
switched to reading the cursor from `hits[n].sort` (the array OpenSearch appends to each
hit containing the actual sort-key values), which always has exactly as many elements as
the sort definition. This makes the mismatch structurally impossible.

**Recommendation:** Close this issue as completed, noting the fix landed in PR #1046.

---

### [#449: Implement Aggregations Extension POST endpoints](https://github.com/stac-utils/stac-server/issues/449)

**Status: 🔵 Still Open**

**Finding:** `src/lambdas/api/app.js` registers only GET handlers for aggregation routes:
- `GET /aggregate`
- `GET /aggregations`
- `GET /collections/{collectionId}/aggregate`
- `GET /collections/{collectionId}/aggregations`

No POST variants of these routes exist. Per the
[Aggregation Extension spec](https://github.com/stac-api-extensions/aggregation), POST
equivalents are required to support request bodies for large queries. This is a
legitimate open item.

---

### [#363: ingest should distinguish items and collections by type rather than heuristics](https://github.com/stac-utils/stac-server/issues/363)

**Status: ✅ Already Closed**

**Finding:** This issue was closed as completed on 2026-03-05 by @matthewhanson who
identified that the fix was actually committed years earlier (circa 2023) in
[`5a6a93f`](https://github.com/stac-utils/stac-server/commit/5a6a93f7c4b721645eea7df68135ea1e51fbb39f).

The original problem was that the ingest path used heuristics (e.g., presence of `extent`)
to tell items from collections, which was fragile. Today, `src/lib/stac-utils.js` uses
the STAC-spec `type` field directly and throws an explicit error for anything else:

```javascript
export function isCollection(record) {
  return record && record.type === 'Collection'
}

export function isItem(record) {
  if (record && record.type === 'Feature') {
    if ('collection' in record) { return true }
    throw new InvalidSTACItemException('STAC Items must include a "collection" field')
  }
  return false
}
```

If neither `isCollection` nor `isItem` matches, `convertIngestMsgToDbOperation` in
`src/lib/ingest.js` throws `InvalidIngestError`.

This issue was already closed before this review; it is included here for completeness.

---

### [#212: Consider returning 200 with Item for PUT, PATCH, and POST txn endpoints](https://github.com/stac-utils/stac-server/issues/212)

**Status: 🔵 Still Open**

**Finding:** All mutating transaction endpoints still return `204 No Content` rather than
`200 OK` with the updated item body:

- `PUT /collections/{collectionId}/items/{itemId}` → `res.sendStatus(204)`
- `PATCH /collections/{collectionId}/items/{itemId}` → `res.sendStatus(204)`
- `POST /collections/{collectionId}/items` (single item) → `res.sendStatus(201)`
  (correct status code, but no body returned)

There is commented-out dead code in the PATCH handler that shows this was attempted but
left incomplete:

```javascript
//const item =
await api.partialUpdateItem(database, collectionId, itemId, endpoint, req.body)
// res.type('application/geo+json')
// res.json(item)
res.sendStatus(204)
```

No PR has finished this work.

---

### [#206: TypeScript Migration](https://github.com/stac-utils/stac-server/issues/206)

**Status: 🔵 Still Open (Partial)**

**Finding:** The migration has made meaningful progress but is far from complete. Current
state of the codebase:

| Checklist item | Status |
|---|---|
| Enable use of `.ts` files | ✅ Done |
| ESM instead of CommonJS modules | ✅ Done (all files use `import`/`export`) |
| Remove all `@ts-nocheck` | ✅ Done (0 occurrences found) |
| Remove all `@ts-ignore` | ❌ 7 occurrences remain (`src/lib/api.js` and `src/lib/ingest.js`) |
| Start converting leaf files to `.ts` | ❌ Only 2 `.ts` files (`src/lib/s3-utils.ts`, `src/lambdas/api/local.ts`) vs. 26 remaining `.js` files |

The TypeScript compiler is set up and `tsconfig.json` is in place, but the bulk of the
source files have not been converted. This is a long-running migration that may warrant
breaking into smaller per-file sub-tasks.

---

## Recommendations

Based on this review, the following actions are recommended:

### Issues to Close as Completed
- **#863** — Hidden filter for search endpoints (completed in v4.4.0)
- **#864** — Hidden filter for aggregation endpoints (completed in v4.4.0)
- **#823** — Pagination links with excluded sortby fields (fixed in v5.0.0)
- **#530** — search_after / sort mismatch (fixed in v5.0.0 via PR #1046)

### Issues to Remove from Milestone or Close as Not Planned
- **#666** — ava 6.0 timeout issue (OBE since the project did not upgrade to ava 6.0)

### Issues Remaining Open and Still Relevant
- **#870** — Implement collection search support
- **#867** — Upgrade Express to 5.x
- **#851** — LIKE operator for Filter Extension
- **#839** — Upgrade @opensearch-project/opensearch to 3.x
- **#830** — Better log message for collection update
- **#652** — Document IAM auth with OpenSearch Serverless
- **#449** — Aggregations Extension POST endpoints
- **#212** — Return 200 with Item for transaction endpoints
- **#206** — TypeScript Migration (partial completion)
