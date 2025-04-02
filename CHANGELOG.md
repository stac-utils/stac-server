# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## unreleased - TBD

### Changed

- Use Node 22 by default.

## [3.11.0] - 2025-03-27

### Added

- Support for the "in" and "between" operators of the Filter Extension
- Support for "s_intersects" opeartor of the Filter Extension. This implements both the
  "Basic Spatial Functions" and "Basic Spatial Functions with additional Spatial Literals"
  conformance classes, supporting operands for s_intersects of either bbox or GeoJSON
  Geometry literals.

## [3.10.0] - 2025-03-21

### Changed

- Use Node 20 by default. Node 20 will be supported by AWS into 2026. Upgrade was
  not done to Node 22 because it requires upgrading the ava/typescript library.
- The default stac_version for the root Catalog / Landing page is now 1.1.0.

### Fixed

- Removed inapplicable `stac_version` and `stac_extensions` fields from ItemCollection

## [3.9.0] - 2025-01-24

### Changed

- Update to default to OpenSearch 2.17

### Added

- Minimum implementation (basic-cql2 conformance class) of the filter extension for the
  `/search` (GET and POST), `/collections/{collectionId}/items` (GET), and `/aggregate`
  (GET) endpoints. Only CQL2 JSON is supported.

## [3.8.0] - 2024-05-29

### Changed

- Update to default to OpenSearch 2.13

## [3.7.0] - 2024-05-14

### Fixed

- For the first item indexed in a new collection, if all values in the
  `proj:transform` array were integers, the values were typed as integers,
  which would then cause an error for subsequent items that had float values
  in the array.

### Added

- Allow the following CORS headers to be configured with configuration variables:
  - Access-Control-Allow-Origin: `CORS_ORIGIN`
  - Access-Control-Allow-Credentials: `CORS_CREDENTIALS`
  - Access-Control-Allow-Methods: `CORS_METHODS`
  - Access-Control-Allow-Headers: `CORS_HEADERS`

## [3.6.0] - 2024-02-07

### Changed

- Deprecated `grid_geohex_frequency`, `grid_geohash_frequency`, and
  `grid_geotile_frequency` aggregations in favor of new `centroid_geohash_grid_frequency`,
  `centroid_geohex_grid_frequency`, and `centroid_geotile_grid_frequency` aggregations

### Added

- Added `geometry_geohash_grid_frequency` and `geometry_geotile_grid_frequency` that
  aggregate over the geometry of each Item rather than the centroid. Note that the geohex aggregation `geometry_geohex_grid_frequency` is **not** implemented, as OpenSearch 2.11
  does not yet support geohex_grid aggregations over geo_shape fields.

## [3.5.0] - 2024-01-19

### Fixed

- When using sortby, next links were incorrect.

## [3.4.0] - 2023-12-15

### Changed

- Ingest lambda will return a failure if there are errors during ingesting. Previously,
  errors would only be logged and the lambda would always return a success response.
- Landing page (/) and collections endpoint (/collections) now return a 500 if
  create_indices has not been run or cannot connect to database.

## [3.3.0] - 2023-12-04

### Added

- redocly devDependency for docs build

### Removed

- Unused devDependencies for old docs build
- Old `./docs` directory and out of date docs
- Removed support for grid_code_landsat_frequency aggregation.

### Fixed

- STAC API Docs now build and deploy to GitHub Pages using redocly

## [3.2.0] - 2023-11-29

### Added

- Better error handling when create_index fails.

### Fixed

- Removed usages of aws-sdk that were missed in 3.0.0.

## [3.1.0] - 2023-11-28

### Added

- Added support for AWS IAM authentication to AWS OpenSearch Serverless

### Changed

- Replaced use of aws-os-connection library for AWS IAM authentication with support
  in opensearch-js.
- Default to OpenSearch 2.11

## [3.0.0] - 2023-11-09

### Changed

- Use AWS SDK for JavaScript v3 instead of v2
- Use Node 18 by default (with AWS SDK v3 preinstalled, instead of v2)

## [2.4.0] - 2023-11-08

### Changed

- Fix OpenAPI spec version from 1.0.0-rc.4 to 1.0.0
- Update fields, sort, and query extensions to v1.0.0
- Update transaction extension to v1.0.0-rc.3
- Default to OpenSearch 2.9
- Replace geo_shape mapping for proj:geometry field with object, as this fails when
  the geometry is not a valid GeoJSON shape, e.g., coordinate points are not lat/lon.

## [2.3.0] - 2023-09-12

### Changed

- Default to OpenSearch 2.7

### Added

- "AWS Connection" mode support has been re-added.

## [2.2.3] - 2023-07-14

### Changed

- Simplify the error handling around geometry errors.
- When an OpenSearch request returns a 400 status code, use this same status code with a meaningful error message in the stac-server response, instead of always returning a 500 error.

## [2.2.2] - 2023-07-06

### Changed

- Revert validation of Search intersects geometry added in 2.0.0, as it was too strict
  and rejected some usable geometries.

## [2.2.1] - 2023-07-06

### Fixed

- Aggregations 'grid_code_frequency' and 'grid_code_landsat_frequency' were inadvertently
  configured to only return 10 results, now they return all results.

### Added

- Added API Gateway logging config to example serverless.yml config.

## [2.2.0] - 2023-07-03

### Changed

- Search parameters are now logged at info instead of debug.

## [2.1.0] - 2023-06-29

### Fixed

- Post-ingest SNS topic was not being published to when deployed as a Lambda.

## [2.0.0] - 2023-06-26

### Removed

- Elasticsearch is no longer supported as a backend. Only OpenSearch is now supported.
- Only fine-grained access control is supported for connecting to OpenSearch.
  "AWS Connection" mode is no longer supported.

### Removed

- Elasticsearch is no longer supported as a backend. Only OpenSearch is now supported.
- Only fine-grained access control is supported for connecting to OpenSearch.
  "AWS Connection" mode is no longer supported.

### Added

- Publish ingest results to a post-ingest SNS topic
- Add datetime and bbox attributes to post-ingest SNS messages
- Support for Query Extension operators neq, startsWith, endsWith, and contains.
- Validate intersects geometry before sending to Search + better response parsing.

### Changed

- Remove node streams-based ingest code to prepare for post-ingest notifications
- Use the `type` field to determine if ingest is a Collection or Item
- Aggregations `grid_code_frequency` and `grid_code_landsat_frequency` are no longer
  restricted to 2000 buckets

## [1.1.0] - 2023-05-02

### Changed

- Adds API Gateway ID to cloudwatch logs.
- Logs the start of the request in case of Lambda timeout.

## [1.0.0] - 2023-04-24

### Changed

- STAC API Foundation conformance classes are now 1.0.0
- Updated example serverless configuration to use OpenSearch 2.5.
- Added `stac_version` to the default set of fields returned when the `fields` parameter
  is an empty value.
- STAC API Fields Extension conformance class is now 1.0.0-rc.3

### Removed

- POST /aggregate endpoints were removed, as they didn't work correctly.

### Added

- Added support for `/aggregations`, `/collections/{collectionId}/aggregations`, and
  `/collections/{collectionId}/aggregate` endpoints.
- `/search` ItemCollection now has `root` link relation.
- Added grid_geohex_frequency, grid_geohash_frequency, and grid_geotile_frequency aggregations

### Fixed

- `/api` and `/api.html` endpoints were broken, now fixed

## [0.8.1] - 2023-03-29

### Added

- Thumbnail support will now look at Asset or Item level `storage:region` field
  to determine the region for generating the pre-signed URL for the thumbnail.
  Previously used the default behavior of AWS SDK.

## [0.8.0] - 2023-03-06

### Added

- Added support for root and collection-level queryables to be used for Query Extension
  filtering.

## [0.7.0] - 2023-02-09

### Changed

- ESM modules are used instead of CommonJS
- Updated pre-hook auth token example to use SecretsManager rather than single values.

## [0.6.0] - 2023-01-24

### Fixed

- Log level configuration now has an effect on log levels

### Changed

- Log level must be configured with lowercase values error, warn, info, http, verbose, debug, silly instead of uppercase values (this config had no effect before)
- Default request logging format is now "tiny" instead of "dev". Previously, the "dev" format
  wrote color codes into CloudWatch logs, which cluttered output, as they were not used in display.
- Search query and response body is now logged at level "debug" rather than "info"
- Ingested item body is now logged at level "debug" rather than "info"

## [0.5.2] - 2023-01-17

### Fixed

- Fixed incorrect usage of `application/geo+json` in several link relations.
- When cross-cluster search is configured, the first search without a collection returned
  zero results.

## [0.5.1] - 2023-01-10

### Changed

- Max size for POST body is now 1mb instead of 100kb.

## [0.5.0] - 2022-12-23

### Removed

- stac_api_version is no longer field in the root catalog. This was removed from the
  STAC API spec several versions ago, in favor of the conformance classes.
- STAC_API_VERSION environment variable is no longer supported. The version is now hard-coded
  to 1.0.0-rc.2
- `lambdaHashingVersion: 20201221` is now the default for serverless, and has been removed
  from the serverless example config file.

### Added

- Adds support for authenticating to OpenSearch with a username and password when
  fine-grained access control is enabled.
- (Experimental) Aggregation Extension endpoint /aggregate
- Added pre-hook and post-hook Lambda examples
- POST /collections endpoint to create collections
- Configuration of shards and replicas for the indices containing Items can now be done
  with environment variables ITEMS_INDICIES_NUM_OF_SHARDS and ITEMS_INDICIES_NUM_OF_REPLICAS.
- (Experimental) Adds Item 'thumbnail' link to presign an s3 protocol thumbnail asset ARN

### Changed

- ES_HOST variable is now OPENSEARCH_HOST, but both will work for now.
- ES_BATCH_SIZE variable is now INGEST_BATCH_SIZE. Both will work. It is recommended not to
  configure this explicitly if not changing the value from the default of 500.
- Landing Page (root) now has links for both GET and POST methods of search link relation
- The STAC API version is now 1.0.0-rc.2
- AWS OpenSearch Service OpenSearch 2.3 is used as the default instead of Elasticsearch 7.10.
  See [migration section in README.md](README.md#04x---05x).
- The serverless.example.yml file now has zone awareness enabled and an even number of
  Elasticsearch nodes
- Upgrade serverless to 3.x
- Remove use of serverless-psuedo-parameters
- Upgrade to Node 16

### Fixed

- Collections endpoint (/collections) now has `self` and `root` link relations.

### Deprecated

- ES_BATCH_SIZE variable (replaced by INGEST_BATCH_SIZE)
- ES_HOST variable (replaced by OPENSEARCH_HOST variable)

## [0.4.2] - 2022-12-20

### Added

- (Experimental) Adds Item 'thumbnail' link to presign an s3 protocol thumbnail asset ARN

## [0.4.1] - 2022-07-11

### Added

- Added proper value for 'collections' parameter in the next page link in the result of a GET request
- Added mappings for 'id' and 'collection' for default sort keys
- Added STAC_API_VERSION as an environment variable to the serverless.yml file
- Added STAC_API_VERSION to display on the API landing page within the api.js file under src/lib/api.js in the collectionsToCatalogLinks function
- Add support for pre- and post-hooks

### Changed

- Modified sortby and collections parameters in nextlink
- Used map instead of foreach/push in api.js file
- Changed the rel type to 'server' for the URL to the STAC API webpage inside the Links object
- Modified sortby and collections parameters in nextlink
- Used map instead of foreach/push in api.js file
- Compression of responses is now handled by API Gateway and not Express. This means that the _uncompressed_ response from stac-server [must be less than 6 MB](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html#function-configuration-deployment-and-execution).

### Removed

- Removed the failed-ingest Lambda function from the serverless.yml file since this function is no longer needed
- Deleted failed-ingest folder from the src/lambdas directory

## [0.4.0] - 2022-04-19

### Added

- Add conformance classes for `STAC API - Features` and `STAC API - Collections`. Both were already fully-supported, but
  were not advertised in the landing page conformsTo attribute or the /conformance endpoint.
- Items larger than 256 KB can now be ingested by writing their contents to S3
- API responses are now compressed
- Transaction Extension is now implemented
- Landing Page link relation service-doc now exists, and points to a Redoc instance
- If a request includes the `X-STAC-Endpoint` header, that endpoint will be used when generating link hrefs

### Fixed

- Open-ended datetime intervals using either empty string or '..' now work
- Correct content types are now returned
- Searching for a nonexistent collection returns empty results
- Re-ingesting an Item maintains the existing value of properties.created and sets properties.updated to now
- Fixes the responses from `/collections/{collectionId}`, `/collections/{collectionId}/items`, and `/collection/{collectionId}/items/{itemId}`.
- Search limit parameter is now validated to be between 1 and 10000 inclusive
- Search datetime parameter is now strictly validated as a RFC 3339 datetime or interval of two datetimes
- Added `root` link relation to Landing Page (`/`)
- GET /search only accepts a bbox value of a comma-separated string and POST /search
  only accepts a bbox array of numbers. Previously, both methods accepted both formats in
  violation of the STAC API spec.

### Changed

- Upgrade to Node 14
- Elasticsearch version update 7.9 -> 7.10
- Use Express for API routing
- Item and collection ingest operations will full replace an item with the same ID. Previously, partial-updates were being performed.
- Improvements to Elasticsearch field mappings
- PATCH /collections/:collectionId/items/:itemId now returns 204 No Content as succcess instead
  of 200 and the updated Item
- Default sortby is now guaranteed to be stable. Previously, it was only by `properties.datetime`, not it is
  by `properties.datetime`, `id`, and `collection`.
- ItemCollection results no longer have a `prev` link relation. This is a by-product of changing
  pagination to use Elasticsearch's more performant `search_after` mechanism rather than `page`
- Pagination works past 10,000 items now
- An invalid search `intersects` parameter may sometimes return a 500 instead of a 400 status code.

### Removed

- Querying Items in a Collection by POST to /collections/:collectionId/items is
  no longer supported, as this is forbidden by the STAC API - Features
  conformance class because it conflicts with the Transaction Extension

## [0.3.1] - 2021-07-28

### Fixed

- Root catalog now properly includes `type: Catalog`

## [0.3.0] - 2021-07-06

### Added

- Added conformsTo to root catalog
- Added geo_point mapping to items -> properties -> epsg:centroid

### Fixed

- Array GET parameters can now be comma-delimited, as per spec
- Collections link rel type changed to `data`
- Added required rel=search links in root
- Geometry now properly being serialized
- Multiple security vulnerability updaets in dependent libraries
- Integration tests

### Changed

- Elasticsearch version update 6.8 -> 7.9
- Updated all mappings
- Enforce only HTTPS access
- Migrate base configuration from t2.small -> t3.small instances
- Updated integration tests to use more update STAC 1.0.0 spec
- Some fields, such as assets and links, are now excluded from indexing
- Enforce https
- Increase SQS VisibilityTimeout and Ingest Lambda timeout

### Removed

- Mapping types (deprecated in Elasticsearch)

## [0.2.1] - 2020-12-14

### Fixed

- Pagination is now STAC compliant
- Response from `/collections` is now STAC compliant
- Return 404 errors when collections or items not found

### Removed

- Specified mapping for temporal and spatial properties (will auto map)

## [0.2.0] - 2020-09-21

### Added

- Partial STAC transaction extension added, disabled by default - set ENABLE_TRANSACTIONS_EXTENSION=true to enable

### Changed

- Name changed from 'stac-api' to 'stac-server' to avoid confusion with [stac-api-spec](https://github.com/radiantearth/stac-api-spec)
- Elasticsearch client library updated to @elastic/elasticsearch

### Removed

- Collection properties no longer merged into Item on ingest (commons extension removed from STAC)

## [0.1.0] - 2020-03-20

Initial release, forked from [sat-api](https://github.com/sat-utils/sat-api/tree/develop).

Compliant with STAC 0.9.0

<!-- [unreleased]: https://github.com/stac-utils/stac-api/compare/v3.6.0...main -->

[3.11.0]: https://github.com/stac-utils/stac-api/compare/v3.10.0...v3.11.0
[3.10.0]: https://github.com/stac-utils/stac-api/compare/v3.9.0...v3.10.0
[3.9.0]: https://github.com/stac-utils/stac-api/compare/v3.8.0...v3.9.0
[3.8.0]: https://github.com/stac-utils/stac-api/compare/v3.7.0...v3.8.0
[3.7.0]: https://github.com/stac-utils/stac-api/compare/v3.6.0...v3.7.0
[3.6.0]: https://github.com/stac-utils/stac-api/compare/v3.5.0...v3.6.0
[3.5.0]: https://github.com/stac-utils/stac-api/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/stac-utils/stac-api/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/stac-utils/stac-api/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/stac-utils/stac-api/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/stac-utils/stac-api/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/stac-utils/stac-api/compare/v2.4.0...v3.0.0
[2.4.0]: https://github.com/stac-utils/stac-api/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/stac-utils/stac-api/compare/v2.2.3...v2.3.0
[2.2.3]: https://github.com/stac-utils/stac-api/compare/v2.2.2...v2.2.3
[2.2.2]: https://github.com/stac-utils/stac-api/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/stac-utils/stac-api/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/stac-utils/stac-api/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/stac-utils/stac-api/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/stac-utils/stac-api/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/stac-utils/stac-api/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/stac-utils/stac-api/compare/v0.8.1...v1.0.0
[0.8.1]: https://github.com/stac-utils/stac-api/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/stac-utils/stac-api/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/stac-utils/stac-api/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/stac-utils/stac-api/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/stac-utils/stac-api/compare/v0.4.1...v0.5.2
[0.5.1]: https://github.com/stac-utils/stac-api/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/stac-utils/stac-api/compare/v0.4.1...v0.5.0
[0.4.2]: https://github.com/stac-utils/stac-api/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/stac-utils/stac-api/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/stac-utils/stac-api/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/stac-utils/stac-api/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/stac-utils/stac-api/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/stac-utils/stac-api/compare/v0.1.0...v0.2.1
[0.2.0]: https://github.com/stac-utils/stac-api/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/stac-utils/stac-api/tree/v0.1.0
