# Usage Guide

Comprehensive examples for querying and using the STAC API.

## Overview

This guide provides practical examples and tutorials for working with STAC Server. Whether you're ingesting data, searching for items, or analyzing collections, you'll find step-by-step instructions here.

Throughout this guide, `${HOST}` represents your stac-server base URL.

## Getting Started

Stac-server is a web API that returns JSON responses. You can interact with it using:

- **Command line**: `curl` or `wget`
- **Python**: [pystac-client](https://pystac-client.readthedocs.io/) - Python library and CLI for STAC APIs
- **Programming languages**: Any HTTP client library
- **STAC clients**: See [STAC Index](https://stacindex.org/ecosystem?category=Client) for specialized tools

**Base URL Pattern**: Most deployments follow `https://{domain}/{version}` (e.g., `https://earth-search.aws.element84.com/v1`)

**API Documentation**: Visit the `/api` endpoint on any stac-server instance for interactive OpenAPI documentation.

Throughout this guide, `${HOST}` represents your stac-server base URL.

## Authentication

Most public STAC APIs do not require authentication for read operations. However, production deployments typically require authentication for:

- Creating or modifying Collections (Transaction extension)
- Creating, updating, or deleting Items (Transaction extension)
- Accessing the aggregations endpoint (if restricted)

Check your deployment's documentation for authentication requirements.

## Ingesting Data

STAC Collections and Items can be ingested using two methods:

### Method 1: SNS Topic (Recommended for AWS)

The primary ingestion method is publishing to the SNS Topic `stac-server-<stage>-ingest`. The ingest Lambda consumes messages from an SQS queue subscribed to this topic.

**Note:** This method requires AWS account access and proper IAM permissions.

**Important:** Collections must be ingested before Items that belong to them.

#### Publishing to SNS

Publish a STAC Item or Collection directly:

```json
{
  "type": "Feature",
  "stac_version": "1.0.0",
  "id": "my-item",
  "collection": "my-collection",
  ...
}
```

### Large Items

For items exceeding the 256 KB SQS message limit, publish a reference:

```json
{
  "href": "s3://source-bucket/path/to/item.json"
}
```

Supported protocols: `s3://`, `http://`, `https://`

### Ingest Actions

The ingest pipeline supports actions for data management:

**Truncate collection** (removes all items, keeps collection):

```json
{
  "type": "action",
  "command": "truncate",
  "collection": "my-collection"
}
```

Note: Requires `ENABLE_INGEST_ACTION_TRUNCATE=true` in deployment config.

### Post-Ingest Notifications

After ingest, success/failure events are published to a post-ingest SNS topic with attributes for filtering:

- `recordType`: `Collection` or `Item`
- `ingestStatus`: `successful` or `failed`  
- `collection`: Collection ID

For deployment configuration including SNS subscriptions and error handling, see the [Deployment Guide](../deployment/index.md).

### Method 2: Transaction Extension (Direct API)

If the [Transaction Extension](https://github.com/stac-api-extensions/transaction) is enabled (`ENABLE_TRANSACTIONS_EXTENSION=true`), you can ingest data directly via the API:

```bash
# Create a collection
curl -X POST "${HOST}/collections" \
  -H "Content-Type: application/json" \
  -d @collection.json

# Add an item
curl -X POST "${HOST}/collections/{collectionId}/items" \
  -H "Content-Type: application/json" \
  -d @item.json
```

**Note:** Transaction endpoints typically require authentication in production deployments. This method does not require AWS account access.

## Searching Items

The `/search` endpoint is the primary way to discover STAC Items. It supports both GET and POST methods.

### Basic Search (GET)

Search using URL query parameters:

```shell
curl "${HOST}/search?collections=sentinel-2-l2a&bbox=10,10,15,15&limit=10"
```

**Common parameters:**
- `collections` - Comma-separated collection IDs
- `bbox` - Bounding box: `min_lon,min_lat,max_lon,max_lat`
- `datetime` - Temporal filter (ISO 8601): `2024-01-01T00:00:00Z/2024-12-31T23:59:59Z`
- `limit` - Maximum results to return (default varies by deployment)

### Basic Search (POST)

POST requests use JSON bodies for more complex queries:

```shell
curl -X POST "${HOST}/search" \
  -H 'Content-Type: application/json' \
  -d '{
  "collections": ["sentinel-2-l2a"],
  "bbox": [10, 10, 15, 15],
  "datetime": "2024-01-01T00:00:00Z/2024-12-31T23:59:59Z",
  "limit": 10
}'
```

**Advantages of POST:**
- No URL encoding needed
- Supports complex filter expressions
- Better for large queries

### Understanding Results

Search responses are GeoJSON FeatureCollections:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "item-id",
      "collection": "sentinel-2-l2a",
      "geometry": { ... },
      "properties": { ... },
      "assets": { ... }
    }
  ],
  "links": [
    {"rel": "next", "href": "...", "method": "POST"}
  ]
}
```

**Pagination**: Use the `next` link to retrieve additional results.

## Filtering and Querying

Stac-server supports two filtering extensions for property-based queries.

### Query Extension (STACQL)

Simple comparison operators for basic filtering using the [Query Extension](https://github.com/stac-api-extensions/query). Best for single property constraints.

**POST example:**

```json
{
  "collections": ["sentinel-2-l2a"],
  "query": {
    "eo:cloud_cover": {
      "gte": 0,
      "lte": 5
    }
  }
}
```

**Supported operators:**
- `eq` - Equal
- `neq` - Not equal
- `lt` - Less than
- `lte` - Less than or equal
- `gt` - Greater than
- `gte` - Greater than or equal

**GET example (URL-encoded):**

```shell
curl "${HOST}/search?collections=sentinel-2-l2a&query=%7B%22eo%3Acloud_cover%22%3A%7B%22gte%22%3A0%2C%22lte%22%3A5%7D%7D"
```

### Filter Extension (CQL2) - Recommended

Full [CQL2 (Common Query Language)](https://docs.ogc.org/DRAFTS/21-065.html) expressions enable complex boolean logic and spatial operations using the [Filter Extension](https://github.com/stac-api-extensions/filter).

**Combining conditions with AND:**

```json
{
  "collections": ["sentinel-2-l2a"],
  "filter": {
    "op": "and",
    "args": [
      {
        "op": "<=",
        "args": [{"property": "eo:cloud_cover"}, 10]
      },
      {
        "op": ">",
        "args": [{"property": "view:sun_elevation"}, 30]
      }
    ]
  }
}
```

**Combining conditions with OR:**

```json
{
  "filter": {
    "op": "or",
    "args": [
      {
        "op": "=",
        "args": [{"property": "platform"}, "sentinel-2a"]
      },
      {
        "op": "=",
        "args": [{"property": "platform"}, "sentinel-2b"]
      }
    ]
  }
}
```

**Using IN operator:**

```json
{
  "filter": {
    "op": "in",
    "args": [
      {"property": "platform"},
      ["sentinel-2a", "sentinel-2b", "landsat-8"]
    ]
  }
}
```

**Using BETWEEN operator:**

```json
{
  "filter": {
    "op": "between",
    "args": [
      {"property": "eo:cloud_cover"},
      [0, 20]
    ]
  }
}
```

### Important Filtering Rules

**Property naming:**
- ✅ Correct: `"eo:cloud_cover"` (no prefix)
- ❌ Wrong: `"properties.eo:cloud_cover"`

**Field discovery:**

Query available searchable properties:

```shell
curl "${HOST}/collections/{collectionId}/queryables"
```

**Example response:**

```json
{
  "$id": "https://example.com/collections/sentinel-2-l2a/queryables",
  "type": "object",
  "properties": {
    "eo:cloud_cover": {
      "type": "number",
      "minimum": 0,
      "maximum": 100
    },
    "view:sun_elevation": {
      "type": "number"
    }
  }
}
```

## Sorting Results

Control result ordering using the [Sort Extension](https://github.com/stac-api-extensions/sort).

**Sort by datetime (newest first):**

```json
{
  "collections": ["sentinel-2-l2a"],
  "bbox": [10, 10, 15, 15],
  "sortby": [
    {
      "field": "properties.datetime",
      "direction": "desc"
    }
  ]
}
```

**Multiple sort fields:**

```json
{
  "sortby": [
    {
      "field": "properties.eo:cloud_cover",
      "direction": "asc"
    },
    {
      "field": "properties.datetime",
      "direction": "desc"
    }
  ]
}
```

**Note**: Sort field names use `properties.` prefix.

## Field Selection

Reduce response size by requesting only needed fields using the [Fields Extension](https://github.com/stac-api-extensions/fields).

**Include specific fields:**

```json
{
  "collections": ["sentinel-2-l2a"],
  "bbox": [10, 10, 15, 15],
  "fields": {
    "include": ["id", "geometry", "properties.datetime", "properties.eo:cloud_cover"]
  }
}
```

**Exclude fields:**

```json
{
  "fields": {
    "exclude": ["links", "assets"]
  }
}
```

**Combine include and exclude:**

```json
{
  "fields": {
    "include": ["id", "properties"],
    "exclude": ["properties.proj:epsg", "properties.proj:geometry"]
  }
}
```

## Aggregations

The [Aggregation Extension](https://github.com/stac-api-extensions/aggregation) provides statistical summaries without returning full items.

### Discovering Available Aggregations

Each collection advertises supported aggregations:

```shell
curl "${HOST}/collections/{collectionId}/aggregations"
```

**Example response:**

```json
{
  "aggregations": [
    {"name": "total_count", "data_type": "integer"},
    {"name": "datetime_max", "data_type": "datetime"},
    {"name": "datetime_min", "data_type": "datetime"},
    {"name": "datetime_frequency", "data_type": "frequency_distribution"},
    {"name": "cloud_cover_frequency", "data_type": "frequency_distribution"},
    {"name": "platform_frequency", "data_type": "frequency_distribution"},
    {"name": "grid_code_frequency", "data_type": "frequency_distribution"},
    {"name": "centroid_geohash_grid_frequency", "data_type": "frequency_distribution"}
  ]
}
```

### Requesting Basic Aggregations

Get summary statistics for matching items:

```shell
curl "${HOST}/aggregate?collections=sentinel-2-c1-l2a&bbox=-122.5,37.5,-122.0,38.0&datetime=2024-11-01T00:00:00Z/2024-12-11T23:59:59Z&aggregations=total_count,datetime_min,datetime_max"
```

**Response:**

```json
{
  "aggregations": [
    {
      "name": "total_count",
      "data_type": "integer",
      "value": 16
    },
    {
      "name": "datetime_max",
      "data_type": "datetime",
      "value": "2024-12-09T19:04:10.752Z"
    },
    {
      "name": "datetime_min",
      "data_type": "datetime",
      "value": "2024-11-04T19:03:51.120Z"
    }
  ]
}
```

### Frequency Distributions

Analyze property distributions across items:

```shell
curl "${HOST}/aggregate?collections=sentinel-2-c1-l2a&bbox=-122.5,37.5,-122.0,38.0&datetime=2024-01-01T00:00:00Z/2024-12-11T23:59:59Z&aggregations=datetime_frequency"
```

**Response:**

```json
{
  "aggregations": [
    {
      "name": "datetime_frequency",
      "data_type": "frequency_distribution",
      "overflow": 0,
      "buckets": [
        {"key": "2024-01-01T00:00:00.000Z", "data_type": "datetime", "frequency": 12},
        {"key": "2024-02-01T00:00:00.000Z", "data_type": "datetime", "frequency": 12},
        {"key": "2024-03-01T00:00:00.000Z", "data_type": "datetime", "frequency": 12},
        {"key": "2024-04-01T00:00:00.000Z", "data_type": "datetime", "frequency": 12},
        {"key": "2024-05-01T00:00:00.000Z", "data_type": "datetime", "frequency": 12}
      ]
    }
  ]
}
```

**Understanding buckets:**
- `key` - Start of time period or property value range
- `frequency` - Number of items in this bucket
- `overflow` - Items that didn't fit in any bucket

### Available Aggregation Types

**Basic Statistics:**
- `total_count` - Count of matching items
- `datetime_min` - Earliest datetime value
- `datetime_max` - Latest datetime value

**Frequency Distributions (Property-based):**
- `collection_frequency` - Items per collection
- `platform_frequency` - Items per platform (from `platform` property)
- `datetime_frequency` - Items over time (monthly buckets)
- `cloud_cover_frequency` - Cloud cover ranges (from `eo:cloud_cover`)
- `grid_code_frequency` - Items per grid cell (from `grid:code` extension)
- `sun_elevation_frequency` - Sun elevation histogram (from `view:sun_elevation`)
- `sun_azimuth_frequency` - Sun azimuth histogram (from `view:sun_azimuth`)
- `off_nadir_frequency` - Off-nadir angle histogram (from `view:off_nadir`)

**Frequency Distributions (Spatial):**
- `centroid_geohash_grid_frequency` - Items by geohash cell of centroid
- `centroid_geohex_grid_frequency` - Items by geohex cell of centroid
- `centroid_geotile_grid_frequency` - Items by geotile cell of centroid
- `geometry_geohash_grid_frequency` - Items by geohash cell of geometry
- `geometry_geotile_grid_frequency` - Items by geotile cell of geometry

**Note:** Spatial aggregations require setting precision parameters (e.g., `centroid-geohash-grid-frequency-precision=4`). See the [Configuration Guide](../configuration/index.md) for details on configuring aggregations.

### Spatial Distribution Example

Analyze geographic distribution of items:

```shell
curl "${HOST}/aggregate?collections=sentinel-2-c1-l2a&bbox=-125,35,-115,42&datetime=2024-01-01/2024-12-31&aggregations=centroid_geohash_grid_frequency&centroid-geohash-grid-frequency-precision=4"
```

**Response:**

```json
{
  "aggregations": [
    {
      "name": "centroid_geohash_grid_frequency",
      "data_type": "frequency_distribution",
      "buckets": [
        {"key": "9q60", "frequency": 145},
        {"key": "9q8y", "frequency": 132},
        {"key": "9qh1", "frequency": 98}
      ]
    }
  ]
}
```

Each `key` is a [geohash](https://en.wikipedia.org/wiki/Geohash) cell identifier that can be decoded to lat/lon bounds for mapping.

**Decoding geohashes:**

```python
import pygeohash as pgh

# Decode geohash to lat/lon and bounding box
lat, lon = pgh.decode('9q60')  # Returns center point
bbox = pgh.decode_exactly('9q60')  # Returns (lat, lon, lat_error, lon_error)

# Get bounding box
from geopy import Point
from geopy.distance import distance
# Calculate bbox from center and errors
```

Or use online tools:
- [geohash.org](http://geohash.org/) - Interactive geohash decoder and map
- [movable-type.co.uk/scripts/geohash.html](https://www.movable-type.co.uk/scripts/geohash.html) - Geohash converter

### Combining Aggregations with Filters

Aggregations respect all search parameters:

```shell
curl "${HOST}/aggregate?collections=sentinel-2-c1-l2a&bbox=-122.5,37.5,-122.0,38.0&datetime=2024-06-01/2024-09-01&aggregations=total_count,cloud_cover_frequency" \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{
    "filter": {
      "op": "<=",
      "args": [{"property": "eo:cloud_cover"}, 20]
    }
  }'
```

**Configuration**: See the [Configuration Guide](../configuration/index.md) for how to enable and configure aggregations for your collections.

## Asset Proxy

When asset proxying is enabled, stac-server provides secure access to S3 assets via pre-signed URLs.

### Accessing Item Assets

Get a pre-signed URL for an asset:

```shell
curl -i "${HOST}/collections/{collectionId}/items/{itemId}/assets/{assetKey}"
```

**Response:**

```
HTTP/1.1 302 Found
Location: https://s3.amazonaws.com/bucket/path/to/asset.tif?X-Amz-Algorithm=...
```

The endpoint returns an HTTP 302 redirect to a temporary pre-signed URL.

### Accessing Collection Assets

Collections can also have assets (e.g., collection-level thumbnails):

```shell
curl -i "${HOST}/collections/{collectionId}/assets/{assetKey}"
```

### How Proxying Works

When asset proxying is enabled:

1. **Original URLs are preserved**: S3 URLs stored in `alternate.s3.href`
2. **Proxy URLs replace hrefs**: Main `href` points to proxy endpoint
3. **Pre-signed on demand**: Temporary URLs generated with configured expiration
4. **Authentication aware**: Can integrate with authorization systems

**Example Item asset with proxying:**

```json
{
  "assets": {
    "visual": {
      "href": "https://api.example.com/v1/collections/sentinel-2/items/item-1/assets/visual",
      "type": "image/tiff",
      "alternate": {
        "s3": {
          "href": "s3://bucket/sentinel-2/item-1/visual.tif"
        }
      }
    }
  }
}
```

**Configuration**: See the [Configuration Guide](../configuration/index.md) for asset proxy settings including:
- Bucket access modes (ALL, ALL_BUCKETS_IN_ACCOUNT, LIST, NONE)
- URL expiration times
- IAM role configuration

## Client Libraries

### Python

**pystac-client** - Official STAC client:

```python
from pystac_client import Client

# Connect to stac-server
catalog = Client.open("https://earth-search.aws.element84.com/v1")

# Search for items
search = catalog.search(
    collections=["sentinel-2-c1-l2a"],
    bbox=[-122.5, 37.5, -122.0, 38.0],
    datetime="2024-01-01/2024-12-31",
    query={"eo:cloud_cover": {"lt": 10}}
)

# Iterate results
for item in search.items():
    print(f"{item.id}: {item.properties['datetime']}")
```

**Installation**: `pip install pystac-client`

### JavaScript/TypeScript

**stac-js** - STAC client for Node.js and browsers:

```javascript
import { STACClient } from '@radiantearth/stac-js';

const client = new STACClient('https://earth-search.aws.element84.com/v1');

const results = await client.search({
  collections: ['sentinel-2-c1-l2a'],
  bbox: [-122.5, 37.5, -122.0, 38.0],
  datetime: '2024-01-01/2024-12-31',
  limit: 10
});
```

### Command Line

**stac-client** - CLI tool:

```shell
# Install
pip install stac-client

# Search
stac-client search https://earth-search.aws.element84.com/v1 \
  --collections sentinel-2-c1-l2a \
  --bbox -122.5 37.5 -122.0 38.0 \
  --datetime 2024-01-01/2024-12-31
```

### Additional Tools

Browse the [STAC Index](https://stacindex.org/ecosystem?category=Client) for more clients including:

- **QGIS plugins** - Desktop GIS integration
- **R packages** - Statistical analysis
- **Jupyter notebooks** - Interactive exploration
- **Web applications** - Browser-based search interfaces

## Next Steps

- **Guides > [Configuration](../configuration/index.md)** - Configure queryables, aggregations, and extensions
- **Guides > [Deployment](../deployment/index.md)** - Deploy STAC Server to AWS
- **Reference > [Architecture](../reference/architecture.md)** - Understand system components and data flows
- **Reference > [API Overview](../reference/api.md)** - Complete endpoint specifications
