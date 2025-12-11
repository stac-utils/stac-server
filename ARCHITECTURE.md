# Architecture

This document provides a comprehensive overview of stac-server's architecture, component interactions, and data flows.

## Table of Contents

- [Overview](#overview)
- [System Components](#system-components)
- [Request Flow](#request-flow)
- [Ingest Pipeline](#ingest-pipeline)
- [OpenSearch Index Structure](#opensearch-index-structure)
- [Authentication & Authorization](#authentication--authorization)
- [Asset Proxy Flow](#asset-proxy-flow)
- [Pre/Post Hook System](#prepost-hook-system)
- [Deployment Architecture](#deployment-architecture)

## Overview

Stac-server is a serverless implementation of the STAC API specification built entirely on AWS managed services. The architecture is designed for:

- **Scalability**: Auto-scaling Lambda functions handle any load
- **Cost Efficiency**: Pay-per-use pricing with minimal idle infrastructure (OpenSearch cluster runs continuously)
- **Reliability**: Managed services with built-in redundancy
- **Event-Driven**: Asynchronous ingest pipeline with guaranteed delivery

**Core Principle**: Separation of read (API) and write (Ingest) paths for optimal performance and reliability.

## System Components

```mermaid
graph TB
    subgraph "Client Layer"
        client[API Clients]
        publisher[Data Publishers]
    end
    
    subgraph "AWS Edge"
        apigw[API Gateway]
    end
    
    subgraph "Compute Layer"
        apiLambda[API Lambda]
        ingestLambda[Ingest Lambda]
        preHook[Pre-Hook Lambda<br/>optional]
        postHook[Post-Hook Lambda<br/>optional]
    end
    
    subgraph "Queue Layer"
        ingestSNS[Ingest SNS Topic]
        postIngestSNS[Post-Ingest SNS Topic]
        ingestSQS[Ingest SQS Queue]
        dlq[Dead Letter Queue]
    end
    
    subgraph "Data Layer"
        opensearch[(OpenSearch)]
        s3[S3 Buckets<br/>Asset Storage]
        secrets[Secrets Manager<br/>Credentials]
    end
    
    client -->|HTTP/HTTPS| apigw
    apigw -->|Proxy| apiLambda
    apiLambda -.->|Optional| preHook
    apiLambda -.->|Optional| postHook
    apiLambda -->|Query| opensearch
    apiLambda -->|Generate URLs| s3
    
    publisher -->|Publish Items| ingestSNS
    ingestSNS -->|Fan-out| ingestSQS
    ingestSQS -->|Batch| ingestLambda
    ingestLambda -->|Write| opensearch
    ingestLambda -->|Status| postIngestSNS
    ingestSQS -->|Failed| dlq
    
    apiLambda -.->|Credentials| secrets
    ingestLambda -.->|Credentials| secrets

    style opensearch fill:#ff9900
    style apiLambda fill:#ff9900
    style ingestLambda fill:#ff9900
    style apigw fill:#ff4f8b
```

### Component Descriptions

| Component | Type | Purpose | Scaling |
|-----------|------|---------|---------|
| **API Gateway** | Managed Service | HTTP endpoint, request routing, throttling | Auto-scales to millions of requests |
| **API Lambda** | Serverless Function | STAC API implementation, query processing | Concurrent execution up to account limits |
| **Ingest Lambda** | Serverless Function | Process and index Collections/Items | Batch processing with SQS triggers |
| **Pre-Hook Lambda** | Optional Function | Request authentication/modification | Synchronous, adds latency |
| **Post-Hook Lambda** | Optional Function | Response transformation/logging | Synchronous, adds latency |
| **OpenSearch** | Managed Database | Document store and search engine | Configurable instance types and counts |
| **Ingest SNS Topic** | Managed Queue | Entry point for data ingestion | Unlimited throughput |
| **Ingest SQS Queue** | Managed Queue | Buffering and batching | Unlimited retention |
| **Post-Ingest SNS Topic** | Managed Queue | Notification of ingest status | Unlimited throughput |
| **Dead Letter Queue** | Managed Queue | Failed ingest messages | Unlimited retention |
| **Secrets Manager** | Managed Service | OpenSearch credentials storage | N/A |
| **S3 Buckets** | Object Storage | Asset storage (external or managed) | Unlimited |

## Request Flow

### Standard API Request

```mermaid
sequenceDiagram
    participant Client
    participant API Gateway
    participant Pre-Hook
    participant API Lambda
    participant OpenSearch
    participant Post-Hook
    
    Client->>API Gateway: GET /search?bbox=...
    API Gateway->>API Lambda: Lambda Proxy Event
    
    alt Pre-Hook Enabled
        API Lambda->>Pre-Hook: Invoke (async)
        Pre-Hook-->>API Lambda: Modified Event / Auth Result
    end
    
    API Lambda->>API Lambda: Parse & Validate Request
    API Lambda->>OpenSearch: Query with filters
    OpenSearch-->>API Lambda: Matching documents
    API Lambda->>API Lambda: Transform to STAC response
    
    alt Post-Hook Enabled
        API Lambda->>Post-Hook: Invoke (async)
        Post-Hook-->>API Lambda: Modified Response
    end
    
    API Lambda-->>API Gateway: HTTP Response
    API Gateway-->>Client: STAC FeatureCollection
```

**Key Points:**
- Pre-hook can modify request or reject with 401/403
- OpenSearch queries use JSON DSL for complex filtering
- Response includes STAC-compliant links for pagination
- Post-hook can add headers, modify body, or log

### Search Query Processing

The API Lambda translates STAC API parameters to OpenSearch queries:

1. **Collection Filter**: `term` query on `collection` field
2. **Bbox**: `geo_bounding_box` query on `geometry` field
3. **Datetime**: `range` query on `properties.datetime`
4. **CQL2 Filter**: Recursive translation to OpenSearch DSL
5. **Sort**: Maps to OpenSearch `sort` array
6. **Pagination**: Uses `search_after` for efficient deep pagination

## Ingest Pipeline

### Message Flow

```mermaid
flowchart TD
    start[Publisher] -->|Publish JSON| ingestSNS[Ingest SNS Topic]
    ingestSNS -->|Subscribe| ingestSQS[Ingest SQS Queue]
    ingestSQS -->|Batch 1-10 msgs| ingestLambda[Ingest Lambda]
    
    ingestLambda -->|Parse| decision{Message Type?}
    
    decision -->|href reference| fetch[Fetch from S3/HTTP]
    decision -->|inline JSON| validate[Validate STAC]
    fetch --> validate
    
    validate -->|Valid| type{Type?}
    validate -->|Invalid| fail[Failed]
    
    type -->|Collection| collIndex[Write to collections index]
    type -->|Item| itemIndex[Write to collection-specific index]
    type -->|Action| action[Execute action truncate]
    
    collIndex --> transform[Apply Asset Proxy]
    itemIndex --> transform
    
    transform --> success[Success]
    
    success --> notify[Publish to Post-Ingest SNS]
    fail --> notify
    
    fail -->|Max retries exceeded| dlq[Dead Letter Queue]
    
    notify --> subscribers[Subscribed systems]

    style success fill:#90EE90
    style fail fill:#FFB6C1
    style dlq fill:#FF6B6B
    style ingestLambda fill:#ff9900
```

### Ingest Message Formats

**Inline Item/Collection:**
```json
{
  "type": "Feature",
  "stac_version": "1.0.0",
  "id": "item-id",
  "collection": "my-collection",
  "geometry": {...},
  "properties": {...}
}
```

**Reference (for large items):**
```json
{
  "href": "s3://my-bucket/path/to/item.json"
}
```

**Action (delete all items from collection):**
```json
{
  "type": "action",
  "command": "truncate",
  "collection": "my-collection"
}
```

> **Note**: The `truncate` command deletes all items from the specified collection's index using OpenSearch's `deleteByQuery` API. This is a destructive operation that requires `ENABLE_INGEST_ACTION_TRUNCATE=true`. It cannot be used on the collections index or wildcard indices.

### Ingest Processing Steps

1. **Receive**: Lambda triggered by SQS with batch of 1-10 messages
2. **Parse**: Extract STAC document from SNS wrapper and SQS record
3. **Fetch**: If href reference, retrieve from S3 or HTTP
4. **Validate**: Check STAC version, required fields, schema
5. **Route**:
   - Collections → `collections` index
   - Items → `<collection-id>` index
   - Actions → Execute command
6. **Transform**: Apply asset proxy transformations if enabled
7. **Index**: Write to OpenSearch with upsert semantics
8. **Notify**: Publish success/failure to Post-Ingest SNS
9. **Cleanup**: Delete message from SQS or send to DLQ on failure

### Error Handling

- **Transient Errors** (network, OpenSearch timeout): Automatic retry via SQS visibility timeout
- **Permanent Errors** (invalid JSON, missing collection): Send to Dead Letter Queue after max retries
- **Partial Batch Failures**: Successfully processed messages are deleted, failures return to queue

## OpenSearch Index Structure

### Collections Index

**Index Name**: `collections` (configurable via `COLLECTIONS_INDEX`)

**Mapping Highlights**:
```json
{
  "mappings": {
    "properties": {
      "id": {"type": "keyword"},
      "type": {"type": "keyword"},
      "stac_version": {"type": "keyword"},
      "title": {"type": "text"},
      "description": {"type": "text"},
      "license": {"type": "keyword"},
      "extent": {
        "properties": {
          "spatial": {
            "properties": {
              "bbox": {"type": "double"}
            }
          },
          "temporal": {
            "properties": {
              "interval": {"type": "date"}
            }
          }
        }
      },
      "queryables": {"enabled": false},
      "aggregations": {"enabled": false}
    }
  }
}
```

**Notes**:
- `queryables` and `aggregations` fields are stored but not indexed (served from API)
- One document per collection
- Updated via upsert (partial updates not supported)

### Items Indices

**Index Name**: `<collection-id>` (one index per collection)

**Mapping Highlights**:
```json
{
  "mappings": {
    "properties": {
      "id": {"type": "keyword"},
      "type": {"type": "keyword"},
      "stac_version": {"type": "keyword"},
      "collection": {"type": "keyword"},
      "geometry": {"type": "geo_shape"},
      "bbox": {"type": "double"},
      "properties": {
        "properties": {
          "datetime": {"type": "date"},
          "created": {"type": "date"},
          "updated": {"type": "date"}
        }
      },
      "links": {"enabled": false},
      "assets": {"enabled": false}
    },
    "dynamic_templates": [
      {
        "strings_as_keywords": {
          "match_mapping_type": "string",
          "mapping": {"type": "keyword"}
        }
      }
    ]
  }
}
```

**Notes**:
- Dynamic mapping for item properties (strings become keywords by default)
- `geometry` uses `geo_shape` for complex polygon queries
- `links` and `assets` stored but not indexed (metadata only)
- Index auto-created on first item ingest (can be disabled)

### Index Strategy

**Option 1: Collection Per Index (default)**
- Pros: Independent scaling, deletion = drop index, custom mappings per collection
- Cons: More indices to manage, can't search across collections efficiently

**Option 2: Shared Index (via `COLLECTION_TO_INDEX_MAPPINGS`)**
- Pros: Fewer indices, efficient cross-collection search
- Cons: Shared mappings, delete requires query

## Authentication & Authorization

### OpenSearch Authentication

```mermaid
flowchart LR
    subgraph "Fine-Grained Access Control"
        lambda1[Lambda] -->|Username/Password| sm1[Secrets Manager]
        sm1 --> os1[(OpenSearch<br/>Internal User DB)]
    end
    
    subgraph "IAM Authentication"
        lambda2[Lambda] -->|IAM Role| sts[STS]
        sts -->|SigV4| os2[(OpenSearch<br/>IAM Policy)]
    end
    
    style lambda1 fill:#ff9900
    style lambda2 fill:#ff9900
```

**Fine-Grained Access Control (Default)**:
- Lambda uses service account (e.g., `stac_server`) with read/write permissions
- Credentials stored in Secrets Manager
- Granular role-based permissions within OpenSearch
- Admin uses master account for dashboard/CLI access

**IAM Authentication**:
- Lambda uses its execution role for OpenSearch access
- IAM policies control index-level permissions
- No credentials to manage
- Requires SigV4 signing for all requests

### API Authorization (Optional)

```mermaid
sequenceDiagram
    participant Client
    participant API Gateway
    participant Authorizer
    participant Pre-Hook
    participant API Lambda
    
    Client->>API Gateway: Request + Auth Token
    
    alt API Gateway Authorizer
        API Gateway->>Authorizer: Validate Token
        Authorizer-->>API Gateway: Allow/Deny + Context
    end
    
    API Gateway->>API Lambda: Authorized Request
    
    alt Pre-Hook Authorization
        API Lambda->>Pre-Hook: Request + Headers
        Pre-Hook->>Pre-Hook: Check API Key<br/>Build _collections/_filter
        Pre-Hook-->>API Lambda: Modified Request
    end
    
    API Lambda->>API Lambda: Apply authx filters
    API Lambda-->>Client: Filtered Results
```

**Authorization Layers**:

1. **API Gateway Authorizer** (external):
   - JWT validation, API key checking
   - Adds context to Lambda event
   - Not included in stac-server

2. **Pre-Hook Lambda** (included example):
   - Reads API key from header
   - Validates against Secrets Manager
   - Injects `_collections` or `_filter` parameters

3. **Lambda Authorization Parameters**:
   - `ENABLE_COLLECTIONS_AUTHX`: Restrict by collection list
   - `ENABLE_FILTER_AUTHX`: Apply CQL2 filter to all queries

## Asset Proxy Flow

```mermaid
sequenceDiagram
    participant Client
    participant API Lambda
    participant S3
    
    Note over API Lambda: Asset Proxy Enabled

    Client->>API Lambda: GET /collections/col/items/item
    API Lambda->>API Lambda: Transform asset hrefs
    
    Note over API Lambda: s3://bucket/path/asset.tif<br/>→<br/>/collections/col/items/item/assets/data
    
    API Lambda-->>Client: Item with proxy URLs
    
    Client->>API Lambda: GET /collections/col/items/item/assets/data
    API Lambda->>API Lambda: Check bucket allowlist
    API Lambda->>S3: Generate pre-signed URL
    S3-->>API Lambda: Signed URL (300s expiry)
    API Lambda-->>Client: 302 Redirect to signed URL
    Client->>S3: GET signed URL
    S3-->>Client: Asset data
```

**Asset Transformation**:

Before (original):
```json
{
  "assets": {
    "data": {
      "href": "s3://my-bucket/path/to/file.tif",
      "type": "image/tiff"
    }
  }
}
```

After (proxied):
```json
{
  "assets": {
    "data": {
      "href": "https://api.example.com/collections/col/items/item/assets/data",
      "type": "image/tiff",
      "alternate": {
        "s3": {
          "href": "s3://my-bucket/path/to/file.tif"
        }
      }
    }
  },
  "stac_extensions": [
    "https://stac-extensions.github.io/alternate-assets/v1.2.0/schema.json"
  ]
}
```

**Proxy Modes** (via `ASSET_PROXY_BUCKET_OPTION`):
- `NONE`: Disabled (default)
- `LIST`: Specific buckets from `ASSET_PROXY_BUCKET_LIST`
- `ALL`: All S3 assets
- `ALL_BUCKETS_IN_ACCOUNT`: All accessible buckets in AWS account

## Pre/Post Hook System

The Pre/Post Hook system enables custom logic injection at two key points in the request lifecycle: before request processing (Pre-Hook) and after response generation (Post-Hook). Both hooks are optional Lambda functions invoked synchronously by the API Lambda.

```mermaid
sequenceDiagram
    participant Client
    participant API Gateway
    participant API Lambda
    participant Pre-Hook
    participant OpenSearch
    participant Post-Hook

    Client->>API Gateway: HTTP Request
    API Gateway->>API Lambda: Forward Request
    
    alt Pre-Hook Configured
        API Lambda->>Pre-Hook: Invoke with event
        Pre-Hook->>Pre-Hook: Validate/Authorize
        alt Rejected
            Pre-Hook-->>API Lambda: Return 401/403
            API Lambda-->>Client: Error Response
        else Authorized
            Pre-Hook->>Pre-Hook: Modify Event
            Note over Pre-Hook: Add _collections, _filter,<br/>headers, context
            Pre-Hook-->>API Lambda: Modified Event
        end
    end
    
    API Lambda->>OpenSearch: Query with filters
    OpenSearch-->>API Lambda: Results
    API Lambda->>API Lambda: Generate Response
    
    alt Post-Hook Configured
        API Lambda->>Post-Hook: Invoke with response
        Post-Hook->>Post-Hook: Transform/Log
        Note over Post-Hook: Modify body, add headers,<br/>send analytics
        Post-Hook-->>API Lambda: Modified Response
    end
    
    API Lambda-->>API Gateway: Final Response
    API Gateway-->>Client: HTTP Response

    rect rgba(255, 182, 193, 0.3)
        Note over Pre-Hook: Pre-Hook can reject requests
    end
    rect rgba(144, 238, 144, 0.3)
        Note over Post-Hook: Post-Hook cannot change status
    end
```

### Pre-Hook

The Pre-Hook Lambda is invoked **before** the API Lambda processes the request, allowing request validation, authorization, and modification.

**Capabilities**:
- Read all request headers, query parameters, and body
- Reject request (return error response directly with 401/403)
- Modify request event (add/change query parameters, modify body)
- Add response headers (CORS headers, custom headers)
- Inject authorization parameters (`_collections`, `_filter` for user-specific filtering)

**Example Use Cases**:
- API key validation and quota enforcement
- JWT token verification and claims extraction
- User-specific collection filtering based on permissions
- Request logging and metrics collection
- Custom authentication schemes (OAuth, SAML)
- Geo-fencing or IP-based access control

### Post-Hook

The Post-Hook Lambda is invoked **after** the API Lambda generates the response, allowing response transformation and analytics without affecting core logic.

**Capabilities**:
- Read full response (status code, headers, body)
- Modify response body (transform structure, add computed fields, redact data)
- Add or modify response headers (caching, custom headers)
- Cannot change HTTP status code
- Perform async logging and analytics

**Example Use Cases**:
- Response transformation (inject computed fields, normalize structure)
- Redaction of sensitive data for specific users
- Analytics and metrics collection (usage tracking, performance monitoring)
- Custom STAC extension injection
- Response caching headers based on content type
- A/B testing headers

### Configuration

Both hooks are configured via environment variables pointing to Lambda ARNs. The API Lambda's IAM role must have permission to invoke these functions.

```yaml
# serverless.yml
environment:
  PRE_HOOK: arn:aws:lambda:region:account:function:my-pre-hook
  POST_HOOK: arn:aws:lambda:region:account:function:my-post-hook

iam:
  role:
    statements:
      - Effect: Allow
        Action: lambda:InvokeFunction
        Resource: 
          - arn:aws:lambda:region:account:function:my-pre-hook
          - arn:aws:lambda:region:account:function:my-post-hook
```

**Hook Requirements**:
- Synchronous invocation (`RequestResponse` type)
- Return proper event/response structure
- Handle errors gracefully (timeouts, exceptions)
- Pre-Hook: Must return modified event or error response
- Post-Hook: Must return modified response object

## Deployment Architecture

### Multi-Region Setup

```mermaid
graph TB
    subgraph "Region 1 (us-west-2)"
        r53[Route53]
        cf1[CloudFront Distribution]
        apigw1[API Gateway]
        lambda1[Lambda Functions]
        os1[(OpenSearch)]
    end
    
    subgraph "Region 2 (us-east-1)"
        cf2[CloudFront Distribution]
        apigw2[API Gateway]
        lambda2[Lambda Functions]
        os2[(OpenSearch)]
    end
    
    subgraph "Data Replication"
        os1 -.->|Cross-Cluster<br/>Replication| os2
    end
    
    r53 -->|Geolocation/Latency| cf1
    r53 -->|Geolocation/Latency| cf2
    
    cf1 --> apigw1
    cf2 --> apigw2
    
    apigw1 --> lambda1
    apigw2 --> lambda2
    
    lambda1 --> os1
    lambda2 --> os2

    style os1 fill:#ff9900
    style os2 fill:#ff9900
```

**Multi-Region Considerations**:
- Use OpenSearch Cross-Cluster Replication for data sync
- CloudFront for global edge caching
- Route53 for geographic routing
- Separate ingest per region or centralized

### High Availability Setup

**Components**:
- API Gateway: Multi-AZ by default
- Lambda: Multi-AZ by default
- OpenSearch: Multi-AZ with dedicated master nodes
- SQS: Multi-AZ by default

**Best Practices**:
- 3+ OpenSearch nodes across AZs
- Enable OpenSearch automatic snapshots
- Monitor Lambda concurrent execution limits
- Set up CloudWatch alarms for DLQ depth

### Performance Optimization

**API Response Times**:
- Cold start: 1-3 seconds (first request)
- Warm request: 50-200ms (depends on query complexity)
- OpenSearch query: 10-100ms (most queries)

**Optimization Strategies**:
1. **Provisioned Concurrency**: Keep Lambda warm (costs more)
2. **OpenSearch Tuning**: Right-size instances, add nodes
3. **CloudFront**: Cache GET requests for static data
4. **Connection Pooling**: Reuse OpenSearch connections
5. **Pagination**: Use `search_after` instead of `from`/`size`

**Ingest Throughput**:
- SQS: Unlimited buffering
- Lambda: Up to 1000 concurrent executions (soft limit)
- OpenSearch: Depends on instance size and cluster
- Typical: 100-1000 items/second with proper tuning

### Cost Optimization

**Cost Drivers** (typical production deployment):
1. **OpenSearch**: 70-80% (always running)
2. **Lambda Invocations**: 10-15%
3. **Data Transfer**: 5-10%
4. **Other Services**: 5%

**Optimization Tips**:
- Use Reserved Instances for OpenSearch
- Right-size OpenSearch cluster (don't over-provision)
- Enable response compression
- Use S3 for large assets (not OpenSearch)
- Monitor and alert on Lambda throttles

## Security Architecture

### Network Security

```mermaid
graph LR
    subgraph "Public"
        client[Clients]
        cf[CloudFront]
    end
    
    subgraph "AWS VPC (Optional)"
        apigw[API Gateway<br/>Public]
        lambda[Lambda<br/>VPC or Public]
        os[(OpenSearch<br/>VPC)]
    end
    
    subgraph "Security Controls"
        waf[WAF]
        sg[Security Groups]
        nacl[Network ACLs]
    end
    
    client -->|HTTPS| cf
    cf -->|HTTPS| waf
    waf --> apigw
    apigw --> lambda
    lambda -->|VPC Peering<br/>or VPC Lambda| os
    
    sg -.->|Control| lambda
    sg -.->|Control| os
    nacl -.->|Control| os

    style waf fill:#FF6B6B
    style sg fill:#FFB6C1
```

**Security Layers**:
1. **CloudFront**: DDoS protection, SSL termination, WAF
2. **WAF**: Rate limiting, IP filtering, SQL injection protection
3. **API Gateway**: Throttling, API keys, resource policies
4. **Lambda**: Execution role with minimal permissions
5. **OpenSearch**: VPC isolation, security groups, encryption at rest/in transit
6. **Secrets Manager**: Encrypted credential storage

### Data Security

**Encryption**:
- **At Rest**: OpenSearch encryption enabled, S3 bucket encryption
- **In Transit**: TLS 1.2+ for all connections
- **Secrets**: AWS Secrets Manager with KMS encryption

**Access Control**:
- **Least Privilege**: Lambda roles with specific permissions
- **Credential Rotation**: Automated via Secrets Manager
- **Audit Logging**: CloudWatch logs for all Lambda invocations
- **OpenSearch Audit**: Fine-grained audit logs (when enabled)

---

For deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).  
For configuration options, see [CONFIGURATION.md](CONFIGURATION.md).
