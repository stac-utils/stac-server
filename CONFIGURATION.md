# Configuration

**Documentation:** [README](README.md) | [Architecture](ARCHITECTURE.md) | [Configuration](CONFIGURATION.md) | [Deployment](DEPLOYMENT.md) | [Contributing](CONTRIBUTING.md) | [Security](SECURITY.md) | [Changelog](CHANGELOG.md)

This document covers runtime configuration of stac-server through environment variables and collection-level parameters.

## Table of Contents

- [Environment Variables](#environment-variables)
  - [OpenSearch/Elasticsearch Connection](#opensearchelasticsearch-connection)
  - [API Configuration](#api-configuration)
  - [CORS Settings](#cors-settings)
  - [Extensions](#extensions)
  - [Asset Proxy](#asset-proxy)
  - [Authorization](#authorization)
  - [Ingest](#ingest)
  - [Pre/Post Hooks](#prepost-hooks)
  - [Request Handling and Logging](#request-handling-and-logging)
- [Collection Configuration](#collection-configuration)
  - [Queryables](#queryables)
  - [Aggregations](#aggregations)
- [Best Practices](#best-practices)

## Environment Variables

### OpenSearch/Elasticsearch Connection

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| **OPENSEARCH_HOST** / **ES_HOST** | Hostname or URL of the OpenSearch/Elasticsearch instance. Can include protocol (`https://...`) or without. **Note:** When deploying with serverless.yml, this is automatically set via CloudFormation reference to the OpenSearch domain endpoint. | `http://127.0.0.1:9200` (local) | `https://search-my-cluster.us-west-2.es.amazonaws.com` |
| **OPENSEARCH_USERNAME** | Username for basic authentication to OpenSearch (alternative to IAM or Secrets Manager) | None | `admin` |
| **OPENSEARCH_PASSWORD** | Password for basic authentication to OpenSearch (alternative to IAM or Secrets Manager) | None | `MySecurePassword123` |
| **OPENSEARCH_CREDENTIALS_SECRET_ID** | AWS Secrets Manager secret ID containing OpenSearch credentials as JSON with `username` and `password` fields. Used for Lambda service account when using fine-grained access control. | None | `prod/opensearch/credentials` |
| **COLLECTIONS_INDEX** | Name of the OpenSearch index for storing collections | `collections` | `stac-collections` |

**Deployment Note:** When using the provided serverless.yml template, `OPENSEARCH_HOST` is automatically configured via CloudFormation's `Fn::GetAtt` to reference the deployed OpenSearch domain endpoint. You only need to manually set this variable for external OpenSearch clusters or local development.

### API Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| **STAC_API_URL** | Full URL of the STAC API (used for generating links in responses). Recommended for custom domains. | Auto-detected from API Gateway | `https://stac.example.com` |
| **STAC_API_ROOTPATH** | Root path prefix for the API (used when API is not at domain root) | Empty string | `/stac/v1` |
| **STAC_ID** | Unique identifier for the STAC API (shown in landing page) | `stac-server` | `my-catalog` |
| **STAC_TITLE** | Human-readable title for the STAC API (shown in landing page and queryables) | `A STAC API` | `Earth Search STAC API` |
| **STAC_DESCRIPTION** | Description of the STAC API (shown in landing page) | `A STAC API running on stac-server` | `Open STAC API for satellite imagery search` |
| **STAC_DOCS_URL** | URL to API documentation (adds a link in landing page) | None | `https://docs.example.com/stac-api` |
| **STAC_SERVER_COLLECTION_LIMIT** | Maximum number of collections to return in `/collections` endpoint | `100` | `500` |
| **ITEMS_MAX_LIMIT** | Maximum number of items that can be returned in a single search request | `10000` | `5000` |

### CORS Settings

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|  
| **CORS_ORIGIN** | Allowed origins for CORS requests | `*` (all origins) | `https://app.example.com,https://admin.example.com` |
| **CORS_CREDENTIALS** | Whether to allow credentials in CORS requests | `false` | `true` |
| **CORS_METHODS** | Allowed HTTP methods for CORS requests | `GET,HEAD,PUT,PATCH,POST,DELETE` | `GET,POST,OPTIONS` |
| **CORS_HEADERS** | Additional allowed headers for CORS requests (beyond default browser headers) | Empty string | `X-Custom-Header,Authorization` |

### Extensions

| Variable | Description | Default | Notes |
|----------|-------------|---------|-------|
| **ENABLE_TRANSACTIONS_EXTENSION** | Enable the Transactions Extension for creating/updating/deleting items via API | `false` | When disabled, items can only be ingested via SNS topic |
| **ENABLE_CONTEXT_EXTENSION** | Enable the Context Extension to include matched/returned counts in search responses | `false` | Can impact performance for large result sets |
| **ENABLE_THUMBNAILS** | Enable serving asset thumbnails directly through the API | `false` | |

### Asset Proxy

| Variable | Description | Default | Values/Example |
|----------|-------------|---------|----------------|
| **ASSET_PROXY_BUCKET_OPTION** | Asset proxy mode controlling which S3 assets are proxied | `NONE` (disabled) | `NONE`, `ALL`, `ALL_BUCKETS_IN_ACCOUNT`, `LIST` |
| **ASSET_PROXY_BUCKET_LIST** | Comma-separated list of S3 bucket names to proxy (required when ASSET_PROXY_BUCKET_OPTION is `LIST`) | None | `satellite-imagery,landsat-data,sentinel-data` |
| **ASSET_PROXY_URL_EXPIRY** | Pre-signed URL expiration time in seconds | `300` (5 minutes) | `600` |

### Authorization

| Variable | Description | Default | Notes |
|----------|-------------|---------|-------|
| **ENABLE_COLLECTIONS_AUTHX** | Enable collection-based authorization filtering | `false` | When enabled, expects `_collections` parameter or `stac-collections-authx` header |
| **ENABLE_FILTER_AUTHX** | Enable filter-based authorization using CQL2 filters | `false` | When enabled, expects `_filter` parameter or `stac-filter-authx` header |

### Ingest

| Variable | Description | Default | Notes |
|----------|-------------|---------|-------|
| **POST_INGEST_TOPIC_ARN** | ARN of SNS topic for publishing post-ingest notifications | None | Example: `arn:aws:sns:us-west-2:123456789012:stac-server-prod-post-ingest` |
| **ENABLE_INGEST_ACTION_TRUNCATE** | Enable the `truncate` action for removing all items from a collection | `false` | ⚠️ Enables destructive data operations |

### Pre/Post Hooks

| Variable | Description | Default | Use Cases |
|----------|-------------|---------|-----------|
| **PRE_HOOK** | ARN of Lambda function to invoke before processing API requests | None | Authentication, request validation, custom authorization |
| **POST_HOOK** | ARN of Lambda function to invoke after processing API requests | None | Response transformation, logging, analytics |
| **API_KEYS_SECRET_ID** | AWS Secrets Manager secret ID containing API keys (can be used by custom pre-hook implementations for authentication) | None | Example: `prod/api-keys` |

### Request Handling and Logging

| Variable | Description | Default | Values/Example |
|----------|-------------|---------|----------------|
| **LOG_LEVEL** | Minimum log level for application logging | `warn` | `error`, `warn`, `info`, `debug` |
| **REQUEST_LOGGING_ENABLED** | Enable HTTP request/response logging | `true` | `true` or `false` |
| **REQUEST_LOGGING_FORMAT** | Morgan logging format for HTTP requests | `tiny` | `combined`, `common`, `dev`, `short`, `tiny`, or custom format |
| **ENABLE_RESPONSE_COMPRESSION** | Enable gzip compression for API responses | `true` | `true` or `false` |
| **AWS_REGION** | AWS region for service operations (auto-set in Lambda environment) | Detected from Lambda | `us-west-2` |

## Collection Configuration

Collection-level configuration is specified in the Collection JSON document when it is ingested. These parameters control how Items in the collection are indexed, queried, and presented through the API.

### Queryables

The `queryables` field in a Collection defines which properties can be discovered through the Queryables endpoint. This helps API consumers understand what properties they can filter on.

**Location**: Add to Collection JSON root
**Endpoints Affected**: `/collections/{collectionId}/queryables`, `/queryables`

#### Example Configuration

```json
{
  "id": "sentinel-2-l2a",
  "type": "Collection",
  "title": "Sentinel-2 Level-2A",
  "queryables": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://stac-api.example.com/collections/sentinel-2-l2a/queryables",
    "type": "object",
    "title": "Queryables for Sentinel-2 Level-2A",
    "properties": {
      "eo:cloud_cover": {
        "description": "Cloud cover percentage (0-100)",
        "type": "number",
        "minimum": 0,
        "maximum": 100
      },
      "platform": {
        "description": "Satellite platform",
        "type": "string",
        "enum": ["sentinel-2a", "sentinel-2b"]
      },
      "instruments": {
        "description": "Instrument name",
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["msi"]
        }
      },
      "view:sun_elevation": {
        "description": "Sun elevation angle in degrees",
        "type": "number",
        "minimum": -90,
        "maximum": 90
      },
      "proj:epsg": {
        "description": "EPSG code",
        "type": "integer"
      }
    },
    "additionalProperties": true
  }
}
```

#### Important Notes

- **Required fields**: `$schema`, `type`, `title`, `properties`
- **additionalProperties**: Must be `true` - stac-server doesn't restrict filtering to only defined properties
- **Extraction behavior**: The `queryables` field is extracted and served from the queryables endpoint but removed when serving the Collection itself from `/collections/{collectionId}`
- **Filtering**: All Item `properties` fields are filterable regardless of queryables definition - queryables are informative only
- **Schema compliance**: Use JSON Schema draft 2020-12 for consistency

### Aggregations

The `aggregations` array in a Collection defines which statistical summaries and frequency distributions are available through the Aggregation Extension.

**Location**: Add to Collection JSON root
**Endpoints Affected**: `/collections/{collectionId}/aggregations`, `/collections/{collectionId}/aggregate`, `/aggregate`

#### Example Configuration

```json
{
  "id": "sentinel-2-l2a",
  "type": "Collection",
  "title": "Sentinel-2 Level-2A",
  "aggregations": [
    {
      "name": "total_count",
      "data_type": "integer"
    },
    {
      "name": "datetime_min",
      "data_type": "datetime"
    },
    {
      "name": "datetime_max",
      "data_type": "datetime"
    },
    {
      "name": "datetime_frequency",
      "data_type": "frequency_distribution",
      "frequency_distribution_data_type": "datetime"
    },
    {
      "name": "cloud_cover_frequency",
      "data_type": "frequency_distribution",
      "frequency_distribution_data_type": "numeric"
    },
    {
      "name": "platform_frequency",
      "data_type": "frequency_distribution",
      "frequency_distribution_data_type": "string"
    },
    {
      "name": "centroid_geohash_grid_frequency",
      "data_type": "frequency_distribution",
      "frequency_distribution_data_type": "string"
    }
  ]
}
```

#### Available Aggregations

**Count Aggregations** (data_type: `integer`):
- `total_count` - Total number of items matching the query

**Temporal Bounds** (data_type: `datetime`):
- `datetime_min` - Earliest datetime in result set
- `datetime_max` - Latest datetime in result set

**Frequency Distributions** (data_type: `frequency_distribution`):

*String distributions* (frequency_distribution_data_type: `string`):
- `collection_frequency` - Distribution by collection ID
- `platform_frequency` - Distribution by `platform` property
- `grid_code_frequency` - Distribution by `grid:code` property

*Numeric distributions* (frequency_distribution_data_type: `numeric`):
- `cloud_cover_frequency` - Distribution by `eo:cloud_cover` (0-100)
- `sun_elevation_frequency` - Distribution by `view:sun_elevation` (-90 to 90)
- `sun_azimuth_frequency` - Distribution by `view:sun_azimuth` (0-360)
- `off_nadir_frequency` - Distribution by `view:off_nadir` (0-90)

*Temporal distributions* (frequency_distribution_data_type: `datetime`):
- `datetime_frequency` - Distribution by datetime (monthly intervals by default)

*Geospatial grid distributions* (frequency_distribution_data_type: `string`):
- `centroid_geohash_grid_frequency` - Geohash grid on `proj:centroid` property
- `centroid_geohex_grid_frequency` - Geohex grid on `proj:centroid` property
- `centroid_geotile_grid_frequency` - Geotile grid on `proj:centroid` property
- `geometry_geohash_grid_frequency` - Geohash grid on Item geometry
- `geometry_geotile_grid_frequency` - Geotile grid on Item geometry

#### Aggregation Schema

Each aggregation object requires:

```json
{
  "name": "aggregation_name",
  "data_type": "integer | datetime | frequency_distribution"
}
```

For frequency distributions, also include:
```json
{
  "name": "aggregation_name",
  "data_type": "frequency_distribution",
  "frequency_distribution_data_type": "string | numeric | datetime"
}
```

#### Query Parameters

When querying aggregations, use these parameters:

- **aggregations** (required): Comma-separated list of aggregation names
  - Example: `?aggregations=total_count,platform_frequency,datetime_min`
- **aggregation_params**: JSON object with parameters for specific aggregations
  - Example: `?aggregation_params={"datetime_frequency":{"interval":"1y"}}`

#### Grid Aggregation Parameters

Geospatial grid aggregations support additional parameters:

**Geohash grids**:
```json
{
  "centroid_geohash_grid_frequency": {
    "precision": 3  // 1-12, controls grid cell size
  }
}
```

**Geotile grids**:
```json
{
  "centroid_geotile_grid_frequency": {
    "zoom": 5  // 0-29, controls tile zoom level
  }
}
```

**Geohex grids**:
```json
{
  "centroid_geohex_grid_frequency": {
    "resolution": 4  // 0-15, controls hexagon size
  }
}
```

#### Important Notes

- **Ingest timing**: Aggregations must be defined when the Collection is ingested - they cannot be added later without reingesting
- **Performance**: Grid aggregations on geometry can be expensive for collections with complex geometries
- **Property availability**: Ensure the properties referenced by aggregations (e.g., `eo:cloud_cover`) exist in your Items
- **OpenSearch backend**: Grid aggregations use OpenSearch-specific aggregation features

## Best Practices

### Environment Variable Management

1. **Use Secrets Manager**: Store sensitive credentials (database passwords, API keys) in AWS Secrets Manager rather than environment variables
2. **Separate environments**: Use different variable values for dev/staging/prod environments
3. **Document custom values**: Keep a record of non-default values and their rationale
4. **Validate on startup**: Test critical configurations (database connection) during deployment

### Collection Configuration

1. **Define queryables early**: Add queryables to Collections before ingesting large numbers of Items
2. **Start with essential aggregations**: Don't enable all available aggregations - only those you'll use
3. **Test queries first**: Verify that properties exist in your Items before adding them to queryables
4. **Version control**: Keep Collection JSON definitions in version control
5. **Document extensions**: If using custom properties, document them in Collection description

### Performance Optimization

1. **Limit result sizes**: Set appropriate ITEMS_MAX_LIMIT based on your use case
2. **Use compression**: Keep ENABLE_RESPONSE_COMPRESSION=true for bandwidth savings
3. **Context Extension**: Only enable ENABLE_CONTEXT_EXTENSION if you need exact counts (adds overhead)
4. **Grid precision**: Start with lower precision values for geospatial grids and increase as needed
5. **Index strategy**: Use separate indices per collection for large datasets

### Security

1. **Restrict CORS**: Don't use `CORS_ORIGIN=*` in production - specify allowed origins
2. **Enable authorization**: Use ENABLE_COLLECTIONS_AUTHX and ENABLE_FILTER_AUTHX with an API Gateway authorizer
3. **Limit transactions**: Only enable ENABLE_TRANSACTIONS_EXTENSION if you need public write access
4. **Protect ingest**: The SNS ingest topic should not be publicly accessible
5. **Review hooks**: Pre/post hooks have full access to requests and responses - audit carefully

### Monitoring

1. **Enable logging**: Set LOG_LEVEL=info in production for adequate visibility
2. **Request logging**: Keep REQUEST_LOGGING_ENABLED=true and use a structured format
3. **Post-ingest notifications**: Subscribe to POST_INGEST_TOPIC_ARN for ingest monitoring
4. **Track errors**: Monitor dead letter queue for failed ingests
5. **CloudWatch metrics**: Use CloudWatch to track API latency, error rates, and throughput
