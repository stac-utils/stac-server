# Getting Started

Welcome to STAC Server! This guide will help you understand what STAC Server is and how to get started.

## What is STAC?

The **[SpatioTemporal Asset Catalog (STAC)](https://stacspec.org/)** specification provides a common language to describe geospatial information, making it more easily discoverable and accessible. STAC enables interoperability between systems and allows users to search across multiple catalogs.

## What is STAC Server?

STAC Server is a production-ready implementation of the [STAC API specification](https://github.com/radiantearth/stac-api-spec). It provides:

- **RESTful API**: Search and access spatiotemporal data via HTTP
- **Elasticsearch Backend**: Scalable indexing and search capabilities
- **Serverless Architecture**: Runs on AWS Lambda with API Gateway
- **Extensible**: Supports multiple [STAC extensions](https://stac-api-extensions.github.io/) out of the box

## Key Concepts

### Collections

Collections group related Items together. Each Collection describes:

- Spatial and temporal extents
- Common properties shared by Items
- Available assets and their formats
- Licensing and provider information

### Items

Items represent individual spatiotemporal assets (e.g., satellite scenes, drone imagery). Each Item contains:

- Unique identifier
- Geometry (footprint)
- Datetime(s)
- Properties (metadata)
- Assets (links to actual data files)

### Catalog

The root endpoint that provides links to all Collections and search capabilities.

## Prerequisites

Before deploying STAC Server, ensure you have:

- **AWS Account** with appropriate permissions
- **Node.js** 18.x or later
- **npm** or **yarn** package manager
- **AWS CLI** configured with credentials
- **Serverless Framework** (optional, for deployment)

For development:

- **Docker** and **Docker Compose**
- **OpenSearch** or **Elasticsearch** 2.x

## Next Steps

- **Getting Started > [Installation](installation.md)** - Install and configure STAC Server for development or production
- **Getting Started > [Quick Start](quickstart.md)** - Get up and running with Docker Compose in 5 minutes
- **Guides > [Deployment](../deployment/index.md)** - Deploy to AWS with production-ready configuration
