<!-- omit from toc -->

# stac-server

**A scalable, serverless implementation of the STAC API spec for searching geospatial metadata**

[![Build Status](https://github.com/stac-utils/stac-server/workflows/Push%20Event/badge.svg)](https://github.com/stac-utils/stac-server/actions)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![STAC](https://img.shields.io/badge/STAC-1.1.0-blue)](https://stacspec.org)

**📚 Documentation:** **[stac-utils.github.io/stac-server](https://stac-utils.github.io/stac-server/)**

## Table of Contents

- [Overview](#overview)
- [Quick Start](#-quick-start)
- [Documentation](#-documentation)
- [Supported Versions](#supported-versions)
- [Production Deployments](#-production-deployments)
- [Contributing](#-contributing)
- [License](#license)

## Overview

Stac-server is a production-ready implementation of the [STAC API specification](https://github.com/radiantearth/stac-api-spec) for searching and serving metadata for geospatial data, including satellite imagery. Built on AWS serverless infrastructure (Lambda, API Gateway, OpenSearch), it provides a highly scalable and cost-effective solution for cataloging and discovering Earth observation data.

### 🌟 Key Features

- **📡 Full STAC API Support** - Core, Features, Collections, Item Search with [extensions](https://stac-api-extensions.github.io/)
- **🔍 Advanced Querying** - [Query](https://github.com/stac-api-extensions/query) and [CQL2](https://github.com/stac-api-extensions/filter) filtering, full-text search, spatial and temporal queries
- **📊 Aggregations** - Statistical summaries and frequency distributions via [Aggregation Extension](https://github.com/stac-api-extensions/aggregation)
- **🛸 Serverless Architecture** - Auto-scaling, pay-per-use AWS Lambda and API Gateway
- **🔐 Fine-Grained Access Control** - OpenSearch security with optional pre/post hooks
- **📨 Event-Driven Ingest** - SNS/SQS-based ingestion pipeline with dead-letter handling
- **🗂️ Asset Proxying** - Generate pre-signed S3 URLs for secure asset access

### Tech Stack

- **Runtime:** Node.js 22 (AWS Lambda)
- **API Framework:** AWS API Gateway with Lambda proxy integration
- **Database:** AWS OpenSearch Service
- **Queue/Events:** AWS SNS and SQS for ingest pipeline
- **Infrastructure:** Serverless Framework for deployment
- **Language:** TypeScript

## 🚀 Quick Start

Get started with Docker Compose for local development:

```bash
# Clone the repository
git clone https://github.com/stac-utils/stac-server.git
cd stac-server

# Start services
docker compose up -d

# Ingest sample data
npm run ingest:example

# Test the API
curl http://localhost:3000/
```

For AWS deployment, configuration, and production setup, see the **[complete documentation](https://stac-utils.github.io/stac-server/)**.

## 📚 Documentation

Comprehensive documentation is available at **[stac-utils.github.io/stac-server](https://stac-utils.github.io/stac-server/)**

### Quick Links

- **[Getting Started](https://stac-utils.github.io/stac-server/getting-started/overview/)** - Installation and quick setup
- **[Usage Guide](https://stac-utils.github.io/stac-server/usage/)** - Searching, filtering, aggregations, and more
- **[Configuration](https://stac-utils.github.io/stac-server/configuration/)** - Environment variables and collection settings
- **[Deployment](https://stac-utils.github.io/stac-server/deployment/)** - AWS deployment with Serverless Framework
- **[API Reference](https://stac-utils.github.io/stac-server/reference/api/)** - Complete endpoint documentation
- **[Architecture](https://stac-utils.github.io/stac-server/reference/architecture/)** - System design and data flows
- **[Contributing](https://stac-utils.github.io/stac-server/development/contributing/)** - Development setup and guidelines

### Supported Versions

| stac-server Version(s) | STAC Version | STAC API Version |
| ---------------------- | ------------ | ---------------- |
| 0.1.x                  | 0.9.x        | 0.9.x            |
| 0.2.x                  | <1.0.0-rc.1  | 0.9.x            |
| 0.3.x                  | 1.0.0        | 1.0.0-beta.2     |
| 0.4.x                  | 1.0.0        | 1.0.0-beta.5     |
| 0.5.x-0.8.x            | 1.0.0        | 1.0.0-rc.2       |
| 1.0.0-3.9.x            | 1.0.0        | 1.0.0            |
| >=3.10.0               | 1.1.0        | 1.0.0            |

## 🌍 Production Deployments

The following production instances are powered by stac-server:

- **[Earth Search v1](https://earth-search.aws.element84.com/v1)** - Catalog of AWS Public Datasets (STAC 1.0.0)
- **[USGS Astrogeology STAC API](https://stac.astrogeology.usgs.gov/api)** - Planetary data catalog (STAC 1.0.0)
- **[Landsat Look](https://landsatlook.usgs.gov/stac-server)** - USGS Landsat imagery catalog

## 👽 Contributing

We welcome contributions! For development setup, testing, and contribution guidelines, see the **[Contributing Guide](https://stac-utils.github.io/stac-server/development/contributing/)**.

Quick links:
- **[Report a Bug](https://github.com/stac-utils/stac-server/issues/new?template=bug_report.md)**
- **[Request a Feature](https://github.com/stac-utils/stac-server/issues/new?template=feature_request.md)**
- **[Security Policy](https://stac-utils.github.io/stac-server/about/security/)**

## License

stac-server is licensed under [The MIT License](https://opensource.org/license/mit/).

Copyright for portions of stac-server is held by Development Seed (2016) as part of project [sat-api](https://github.com/sat-utils/sat-api) ([original license](https://github.com/sat-utils/sat-api/blob/master/LICENSE)). Copyright for all changes to stac-server since the fork date is held by Element 84, Inc (2020).

---

**[stac-server](https://github.com/stac-utils/stac-server)** was forked from [sat-api](https://github.com/sat-utils/sat-api). Stac-server is for STAC versions 0.9.0+, while sat-api exists for versions of STAC prior to 0.9.0.
