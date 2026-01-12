# Quick Start

Get STAC Server running with sample data in 5 minutes.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) installed
- `curl` or similar HTTP client

## Step 1: Start the Services

```bash
# Clone the repository
git clone https://github.com/stac-utils/stac-server.git
cd stac-server

# Start services
docker compose up -d

# Wait for services to be ready (about 30 seconds)
sleep 30
```

This starts OpenSearch and the STAC API on `http://localhost:3000`.

## Step 2: Verify the API

Check that the API is running:

```bash
curl http://localhost:3000
```

You should see the catalog landing page with links to `/collections`, `/search`, etc.

## Step 3: Create a Collection

Create a sample collection:

```bash
curl -X POST http://localhost:3000/collections \
  -H 'Content-Type: application/json' \
  -d '{
  "id": "sample-collection",
  "type": "Collection",
  "stac_version": "1.0.0",
  "description": "A sample collection",
  "license": "proprietary",
  "extent": {
    "spatial": {
      "bbox": [[-180, -90, 180, 90]]
    },
    "temporal": {
      "interval": [["2020-01-01T00:00:00Z", null]]
    }
  },
  "links": []
}'
```

Verify the collection was created:

```bash
curl http://localhost:3000/collections/sample-collection
```

## Step 4: Ingest an Item

Add a sample item to the collection:

```bash
curl -X POST http://localhost:3000/collections/sample-collection/items \
  -H 'Content-Type: application/json' \
  -d '{
  "type": "Feature",
  "stac_version": "1.0.0",
  "id": "sample-item",
  "collection": "sample-collection",
  "geometry": {
    "type": "Point",
    "coordinates": [-122.4, 37.8]
  },
  "bbox": [-122.4, 37.8, -122.4, 37.8],
  "properties": {
    "datetime": "2024-01-15T10:30:00Z",
    "title": "Sample Item"
  },
  "assets": {
    "thumbnail": {
      "href": "https://example.com/thumbnail.jpg",
      "type": "image/jpeg",
      "title": "Thumbnail"
    }
  },
  "links": []
}'
```

## Step 5: Search for Items

Now search for items in the collection:

```bash
curl 'http://localhost:3000/search?collections=sample-collection'
```

You should see your sample item in the results.

## Step 6: Try Advanced Queries

### Filter by bounding box:

```bash
curl 'http://localhost:3000/search?collections=sample-collection&bbox=-123,37,-122,38'
```

### Filter by date range:

```bash
curl 'http://localhost:3000/search?collections=sample-collection&datetime=2024-01-01/2024-12-31'
```

### Use POST with JSON for complex queries:

```bash
curl -X POST http://localhost:3000/search \
  -H 'Content-Type: application/json' \
  -d '{
  "collections": ["sample-collection"],
  "bbox": [-123, 37, -122, 38],
  "datetime": "2024-01-01T00:00:00Z/2024-12-31T23:59:59Z",
  "limit": 10
}'
```

## Step 7: Explore the API

Visit the interactive API documentation:

```
http://localhost:3000/api
```

This provides a complete OpenAPI interface for testing all endpoints.

## Cleanup

When you're done, stop the services:

```bash
docker compose down

# Remove volumes (deletes all data)
docker compose down -v
```

## Troubleshooting

### Services not starting

Check Docker logs:

```bash
docker compose logs
```

### Connection refused

Ensure OpenSearch is fully started before the API:

```bash
docker compose logs opensearch
```

Wait for "Node started" message.

### Transaction extension errors

The Transaction extension is enabled by default in Docker Compose. To disable:

```bash
ENABLE_TRANSACTIONS_EXTENSION=false docker compose up
```

## Next Steps

- **Guides > [Usage](../usage/index.md)** - Learn about ingesting data, searching, filtering, and aggregations
- **Guides > [Configuration](../configuration/index.md)** - Configure collections, extensions, and environment variables
- **Guides > [Deployment](../deployment/index.md)** - Deploy a production instance to AWS
