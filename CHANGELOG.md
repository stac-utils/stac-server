# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]


## [0.2.1] - 2020-12-14

### Fixed
- Pagination is now STAC compliant
- Response from `/collections` is now STAC compliant

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

[Unreleased]: https://github.com/stac-utils/stac-api/compare/master...develop
[0.2.0]: https://github.com/stac-utils/stac-api/compare/0.1.0...0.2.0
[0.1.0]: https://github.com/stac-utils/stac-api/tree/0.1.0
