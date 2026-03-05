# API Reference

The STAC Server API implements the [STAC API specification](https://github.com/radiantearth/stac-api-spec) version 1.0.0.

## OpenAPI Specification

The complete OpenAPI 3.0 specification is available:

- **[View Raw Spec](https://github.com/stac-utils/stac-server/blob/main/src/lambdas/api/openapi.yaml)** - Source YAML file
- **[Swagger Editor](https://editor.swagger.io/?url=https://raw.githubusercontent.com/stac-utils/stac-server/main/src/lambdas/api/openapi.yaml)** - Interactive viewer with validation
- **[Redoc Viewer](https://redocly.github.io/redoc/?url=https://raw.githubusercontent.com/stac-utils/stac-server/main/src/lambdas/api/openapi.yaml)** - Clean documentation view

!!! tip "Local Testing"
    When running a STAC Server instance locally, visit `http://localhost:3000/api` for an interactive Redoc interface with live API testing.

## Core Endpoints

### Landing Page

```
GET /
```

Returns catalog links and conformance information.

### Collections

```
GET /collections
GET /collections/{collectionId}
```

List all collections or get a specific collection.

### Items

```
GET /collections/{collectionId}/items
GET /collections/{collectionId}/items/{itemId}
```

List items in a collection or get a specific item.

### Search

```
GET /search
POST /search
```

Search for items across collections. POST method supports complex queries with CQL2 filters.

### Aggregations

```
GET /aggregate
GET /collections/{collectionId}/aggregate
GET /collections/{collectionId}/aggregations
```

Generate statistical aggregations and discover available aggregations for collections.

## Transaction Extension

When enabled, supports creating, updating, and deleting resources using the [Transaction Extension](https://github.com/stac-api-extensions/transaction):

```
POST /collections
PUT /collections/{collectionId}
DELETE /collections/{collectionId}

POST /collections/{collectionId}/items
PUT /collections/{collectionId}/items/{itemId}
PATCH /collections/{collectionId}/items/{itemId}
DELETE /collections/{collectionId}/items/{itemId}
```

## Extensions Supported

STAC Server implements these STAC API extensions:

| Extension | Status | Description |
|-----------|--------|-------------|
| **Core** | ✅ Required | Basic catalog functionality |
| **Item Search** | ✅ Required | Search endpoint |
| **Features** | ✅ Required | Collection and Item endpoints |
| **Transaction** | ⚙️ Optional | Create/update/delete operations |
| **Query** | ✅ Included | Simple property queries |
| **Filter** | ✅ Included | CQL2 filtering |
| **Sort** | ✅ Included | Sort results by properties |
| **Fields** | ✅ Included | Select specific fields |
| **Context** | ✅ Included | Result count metadata |
| **Aggregation** | ✅ Included | Statistical aggregations |

## Authentication

Authentication is deployment-specific. Common patterns:

- **API Keys**: Via `X-API-Key` header
- **OAuth 2.0**: Via `Authorization: Bearer` header
- **AWS IAM**: Via AWS Signature Version 4
- **Public access**: No authentication required

Check your deployment documentation for specific requirements.

## Error Responses

All errors follow RFC 7807 Problem Details format:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Invalid bbox parameter"
}
```

Common status codes:

- `200` - Success
- `201` - Resource created
- `204` - Success (no content)
- `400` - Bad request (invalid parameters)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Resource not found
- `500` - Internal server error
- `503` - Service unavailable

## Next Steps

- **Reference > [OpenAPI Specification](openapi.md)** - Interactive API documentation
- **Guides > [Usage](../usage/index.md)** - Practical examples and tutorials
- **Guides > [Configuration](../configuration/index.md)** - Configure extensions and behavior
- **Reference > [Architecture](architecture.md)** - Understand the system architecture
