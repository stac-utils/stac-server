# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add conformance classes for `STAC API - Features` and `STAC API - Collections`. Both were already fully-supported, but
  were not advertised in the landing page conformsTo attribute or the /conformance endpoint.
- Items larger than 256 KB can now be ingested by writing their contents to S3
- API responses are now compressed
- If a request includes the `X-STAC-Endpoint` header, that endpoint will be used when generating link hrefs

### Fixed

- Open-ended datetime intervals using either empty string or '..' now work
- Correct content types are now returned
- Searching for a nonexistent collection returns empty results
- Re-ingesting an Item maintains the existing value of properties.created and sets properties.updated to now

### Changed

- Upgrade to Node 14
- Elasticsearch version update 7.9 -> 7.10
- Use Express for API routing
- Item and collection ingest operations will full replace an item with the same ID. Previously, partial-updates were being performed.

### Removed

- Querying Items in a Collection by POST to /collections/:collectionId/items is
  no longer supported, as this is forbidden by the STAC API - Features
  conformance class because it conflicts with the Transaction Extension

## [0.3.1] - 2021-07-28

### Removed
- stac_api_version from root catalog ([#126](https://github.com/stac-utils/stac-server/pull/126))

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

[Unreleased]: https://github.com/stac-utils/stac-api/compare/v0.3.1...main
[0.3.1]: https://github.com/stac-utils/stac-api/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/stac-utils/stac-api/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/stac-utils/stac-api/compare/v0.1.0...v0.2.1
[0.2.0]: https://github.com/stac-utils/stac-api/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/stac-utils/stac-api/tree/v0.1.0
