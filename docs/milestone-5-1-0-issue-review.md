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

The [collection-search extension](https://github.com/stac-api-extensions/collection-search)
has not been implemented. No filter/search parameters are supported on the `GET /collections`
endpoint. The current implementation simply returns all collections without any CQL2 filter,
text search, or other search parameters. This is a legitimate open item.

---

### [#867: Upgrade Express to 5.x](https://github.com/stac-utils/stac-server/issues/867)

**Status: 🔵 Still Open**

The project is still using `express: "^4.21.2"` as of the current `package.json`. The
issue correctly describes that upgrading to Express 5.x causes `params.hasOwnProperty is
not a function` errors throughout `api.js`. This remains an open item.

---

### [#864: Add support for "hidden" filter in aggregation endpoints for authorization restrictions](https://github.com/stac-utils/stac-server/issues/864)

**Status: ✅ Already Completed**

This was implemented in [v4.4.0](https://github.com/stac-utils/stac-server/blob/main/CHANGELOG.md).
The `extractRestrictionCql2Filter` function in `src/lib/api.js` extracts a `_filter`
query parameter or `stac-filter-authx` header and ANDs it into the query without
revealing it in response links. This function is called by the `aggregate` function
(used by both `/aggregate` and `/collections/{collectionId}/aggregate`), and is
controlled by the `ENABLE_FILTER_AUTHX` environment variable.

**Recommendation:** Close this issue as completed.

---

### [#863: Add support for "hidden" filter in search endpoints for authorization restrictions](https://github.com/stac-utils/stac-server/issues/863)

**Status: ✅ Already Completed**

This was implemented in [v4.4.0](https://github.com/stac-utils/stac-server/blob/main/CHANGELOG.md),
alongside #864. The `extractRestrictionCql2Filter` function in `src/lib/api.js` extracts
a `_filter` query parameter or `stac-filter-authx` header and ANDs it into the query
without revealing it in pagination links. This function is called by the `searchItems`
function (used by `/search` and `/collections/{collectionId}/items`), and is controlled
by the `ENABLE_FILTER_AUTHX` environment variable.

**Recommendation:** Close this issue as completed.

---

### [#851: Filter Extension: Add support for LIKE operator from Advanced Comparison Operators](https://github.com/stac-utils/stac-server/issues/851)

**Status: 🔵 Still Open**

The LIKE operator is explicitly not implemented. In `src/lib/database.js`, the `LIKE` case
in the filter operator `switch` statement explicitly throws:

```javascript
case OP.LIKE:
  throw new ValidationError("The 'like' operator is not currently supported")
```

This remains an open item that, once implemented, would allow advertising the
`http://www.opengis.net/spec/cql2/1.0/conf/advanced-comparison-operators` conformance
class (since `IN` and `BETWEEN` are already supported).

---

### [#839: Upgrade dependency @opensearch-project/opensearch from 2.x to ^3.4.0](https://github.com/stac-utils/stac-server/issues/839)

**Status: 🔵 Still Open**

The project is still using `@opensearch-project/opensearch: "^2.13.0"` as of the current
`package.json`. This major version upgrade requires updating the code to use the new
API (e.g., `opType` renamed to `op_type` / `type`). This remains an open item.

---

### [#830: Better log message needed when updating an existing collection record](https://github.com/stac-utils/stac-server/issues/830)

**Status: 🔵 Still Open**

In `src/lib/database-client.js` (line 93), the following code still exists:

```javascript
} else {
  logger.error(`${index} already exists.`)
}
```

This generates a misleading error-level log message when updating an existing collection
(which is expected behavior, not an error). The message should be downgraded to `info` or
`debug` level with a more descriptive message like "Index for collection X already exists,
skipping creation". This remains an open item.

---

### [#823: Pagination links not included if sortby field is excluded from search results](https://github.com/stac-utils/stac-server/issues/823)

**Status: ✅ Already Completed**

This was fixed in [v5.0.0](https://github.com/stac-utils/stac-server/blob/main/CHANGELOG.md)
via [PR #1046](https://github.com/stac-utils/stac-server/pull/1046). The implementation
of `buildPaginationLinks` was changed to use the `sort` object returned by OpenSearch in
the `hits.sort` field of each hit, rather than deriving the sort cursor from the document
field values. Since `hits.sort` is always populated by OpenSearch regardless of which
`_source` fields are included, pagination now works correctly even when the sort field is
excluded from the results.

Relevant code in `src/lib/database.js`:
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

The project is currently using `ava: "^5.3"` in `package.json`, not ava 6.0. This issue
was opened to track problems that would need to be resolved before upgrading to ava 6.0.
Since the upgrade to ava 6.0 has not been made, and the project is still on ava 5.x, the
specific problem described (worker threads not exiting via `process.exit()`) is not
encountered in the current test setup.

If/when the project decides to upgrade to ava 6.0, this issue would become relevant again.
However, at this time the issue is not blocking any current work. If upgrading to ava 6.0
is not planned for the 5.1.0 milestone, this issue should either be removed from the
milestone or closed as "not planned".

**Recommendation:** Remove from the 5.1.0 milestone or close as "not planned" since the
project has not upgraded to ava 6.0 and the issue only applies to ava 6.0+.

---

### [#652: Document using IAM auth and OpenSearch Serverless](https://github.com/stac-utils/stac-server/issues/652)

**Status: 🔵 Still Open**

While the IAM authentication *implementation* for AWS OpenSearch Serverless (`aoss`) was
added in [v3.1.0](https://github.com/stac-utils/stac-server/blob/main/CHANGELOG.md)
(with the code in `src/lib/database-client.js` automatically detecting
`aoss.amazonaws.com` hosts and using the `aoss` service for SigV4 signing), the
*documentation* specific to using stac-server with the AWS OpenSearch Serverless
managed service does not exist in the docs. The deployment documentation covers IAM
authentication for standard AWS OpenSearch Service domains, but does not specifically
cover [AWS OpenSearch Serverless](https://aws.amazon.com/opensearch-service/features/serverless/),
which has different setup requirements (e.g., data access policies instead of resource
policies). This remains an open item.

---

### [#530: search_after has 1 value(s) but sort has 3](https://github.com/stac-utils/stac-server/issues/530)

**Status: ✅ Likely Completed**

This error occurred when the `search_after` cursor had a different number of values than
the number of sort fields. This was caused by the old implementation deriving the
pagination cursor from document field values, which could be inconsistent with the
actual sort configuration.

The fix in [v5.0.0](https://github.com/stac-utils/stac-server/blob/main/CHANGELOG.md)
via [PR #1046](https://github.com/stac-utils/stac-server/pull/1046) now derives the
pagination cursor from `hits.sort` (the OpenSearch-returned sort values for each hit),
which always has the same number of elements as the configured sort fields. This
eliminates the mismatch that caused the original error.

**Recommendation:** Close this issue as completed, noting the fix from PR #1046.

---

### [#449: Implement Aggregations Extension POST endpoints](https://github.com/stac-utils/stac-server/issues/449)

**Status: 🔵 Still Open**

Only GET endpoints are implemented for the aggregation extension:
- `GET /aggregate`
- `GET /aggregations`
- `GET /collections/{collectionId}/aggregate`
- `GET /collections/{collectionId}/aggregations`

No POST equivalents exist in `src/lambdas/api/app.js`. This remains an open item.

---

### [#363: ingest should distinguish items and collections by type rather than heuristics](https://github.com/stac-utils/stac-server/issues/363)

**Status: ✅ Already Closed**

This issue was closed as completed on March 5, 2026. It has already been resolved.

---

### [#212: Consider returning 200 with Item for PUT, PATCH, and POST txn endpoints](https://github.com/stac-utils/stac-server/issues/212)

**Status: 🔵 Still Open**

The transaction endpoints currently return `204 No Content` rather than `200 OK` with the
item body:

- `PUT /collections/{collectionId}/items/{itemId}` → `res.sendStatus(204)`
- `PATCH /collections/{collectionId}/items/{itemId}` → `res.sendStatus(204)`

There is commented-out code in the PATCH handler that suggests this was considered but
not completed:

```javascript
//const item =
await api.partialUpdateItem(...)
// res.type('application/geo+json')
// res.json(item)
res.sendStatus(204)
```

This remains an open item.

---

### [#206: TypeScript Migration](https://github.com/stac-utils/stac-server/issues/206)

**Status: 🔵 Still Open (Partial)**

The TypeScript migration is partially complete. The issue's checklist shows:

- [x] Enable use of ts files — Done
- [x] ESM instead of CommonJS modules — Done
- [ ] Flip ts-check / ts-nocheck — Effectively done (0 `@ts-nocheck` comments remain)
- [ ] Remove all ts-nocheck — Done (no `@ts-nocheck` comments exist)
- [ ] Remove all ts-ignores — **Not done** (7 `@ts-ignore` comments remain in
  `src/lib/api.js` and `src/lib/ingest.js`)
- [ ] Start converting leaf dependency files to TS — **Not done** (26 `.js` files remain,
  only 2 `.ts` files: `src/lib/s3-utils.ts` and `src/lambdas/api/local.ts`)

Significant work remains to complete the full TypeScript migration. This is a
long-running item that may warrant breaking into smaller sub-tasks.

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
