# Installation

This guide covers installing STAC Server for development and production environments.

## Development Setup

### Using Docker Compose (Recommended)

The fastest way to get started is with Docker Compose:

```bash
# Clone the repository
git clone https://github.com/stac-utils/stac-server.git
cd stac-server

# Start services
docker compose up -d
```

This starts:

- **OpenSearch** on port 9200
- **STAC API** on port 3000
- **Kibana/OpenSearch Dashboards** on port 5601

The API will be available at `http://localhost:3000`.

### Local Development

For active development without Docker:

```bash
# Install dependencies
npm install

# Start OpenSearch (required)
docker compose up -d opensearch

# Start the API in development mode
npm run serve
```

The development server includes:

- Hot reload on file changes
- Debug logging
- Transaction extension enabled
- No authentication

## Production Deployment

For production deployment to AWS, including infrastructure setup, configuration, and best practices, see the comprehensive **[Deployment Guide](../deployment/index.md)**.

### Docker Production Image

Build and run the production Docker image:

```bash
# Build image
docker build -t stac-server .

# Run container
docker run -p 3000:3000 \
  -e STAC_API_URL=https://your-domain.com \
  -e ES_HOST=your-opensearch-host \
  stac-server
```

## Environment Variables

Key environment variables for all deployments:

| Variable | Required | Description |
|----------|----------|-------------|
| `STAC_API_URL` | Yes | Public URL of the API |
| `ES_HOST` | Yes | OpenSearch/Elasticsearch endpoint |
| `STAC_ID` | No | Catalog identifier (default: `stac-server`) |
| `STAC_TITLE` | No | Catalog title (default: `STAC API`) |
| `STAC_DESCRIPTION` | No | Catalog description |

See the [Configuration Guide](../configuration/index.md) for the complete list.

## Verification

After installation, verify the API is running:

```bash
# Check the landing page
curl http://localhost:3000

# List collections
curl http://localhost:3000/collections

# Check conformance
curl http://localhost:3000/conformance
```

Expected response from landing page:

```json
{
  "id": "stac-server",
  "type": "Catalog",
  "title": "STAC API",
  "description": "A STAC API",
  "stac_version": "1.0.0",
  "conformsTo": [
    "https://api.stacspec.org/v1.0.0/core",
    "https://api.stacspec.org/v1.0.0/item-search",
    ...
  ],
  "links": [...]
}
```

## Next Steps

- **Getting Started > [Quick Start](quickstart.md)** - Complete tutorial with sample data
- **Guides > [Configuration](../configuration/index.md)** - Configure collections and extensions
- **Guides > [Usage](../usage/index.md)** - Learn how to use the API
