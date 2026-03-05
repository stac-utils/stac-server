# OpenAPI Specification

The complete OpenAPI 3.0 specification for STAC Server defines all endpoints, schemas, and extensions.

## Viewing the Specification

<div class="grid cards" markdown>

-   :material-file-code:{ .lg } **Source File**

    ---

    View or download the raw OpenAPI YAML file.

    [:octicons-arrow-right-24: openapi.yaml](https://github.com/stac-utils/stac-server/blob/main/src/lambdas/api/openapi.yaml)

-   :material-api:{ .lg } **Swagger Editor**

    ---

    Interactive viewer with validation and try-it-out features.

    [:octicons-arrow-right-24: Open in Swagger](https://editor.swagger.io/?url=https://raw.githubusercontent.com/stac-utils/stac-server/main/src/lambdas/api/openapi.yaml)

-   :material-book-open-variant:{ .lg } **Redoc Viewer**

    ---

    Clean, responsive API documentation interface.

    [:octicons-arrow-right-24: Open in Redoc](https://redocly.github.io/redoc/?url=https://raw.githubusercontent.com/stac-utils/stac-server/main/src/lambdas/api/openapi.yaml)

-   :material-code-json:{ .lg } **Generate Clients**

    ---

    Use OpenAPI generators to create client libraries.

    [:octicons-arrow-right-24: OpenAPI Generator](https://openapi-generator.tech)

</div>

## Specification Highlights

The STAC Server OpenAPI specification defines:

- **40+ endpoints** covering all STAC API operations
- **Complete schemas** for [STAC Collections](https://github.com/radiantearth/stac-spec/blob/master/collection-spec/collection-spec.md), [Items](https://github.com/radiantearth/stac-spec/blob/master/item-spec/item-spec.md), and search parameters
- **Extension support** for Transaction, Query, Filter, Sort, Fields, and Aggregation
- **Error responses** following RFC 7807 Problem Details
- **Examples** for all request and response types

## Using the Specification

### Generate API Clients

Use OpenAPI Generator to create client libraries:

```bash
# Install OpenAPI Generator
npm install @openapitools/openapi-generator-cli -g

# Generate Python client
openapi-generator-cli generate \
  -i https://raw.githubusercontent.com/stac-utils/stac-server/main/src/lambdas/api/openapi.yaml \
  -g python \
  -o ./stac-client-python

# Generate TypeScript client
openapi-generator-cli generate \
  -i https://raw.githubusercontent.com/stac-utils/stac-server/main/src/lambdas/api/openapi.yaml \
  -g typescript-fetch \
  -o ./stac-client-ts
```

### Validate API Responses

Use the specification to validate API responses:

```bash
# Install spectral
npm install -g @stoplight/spectral-cli

# Validate API responses
spectral lint openapi.yaml
```

### API Testing

Use the specification with testing tools:

```bash
# Dredd API testing
npm install -g dredd
dredd openapi.yaml http://localhost:3000

# Postman collection generation
npx openapi-to-postmanv2 \
  -s openapi.yaml \
  -o stac-server.postman_collection.json
```

## Local Interactive Documentation

When running a STAC Server instance, the `/api` endpoint provides an interactive Redoc interface:

```bash
# Start server locally
npm start

# Visit interactive docs
open http://localhost:3000/api
```

This interface allows you to:

- Browse all endpoints with complete schemas
- View request/response examples
- Test API calls directly from the browser
- Download the OpenAPI specification

## Specification Conformance

The specification implements:

- **[OpenAPI 3.0.3](https://swagger.io/specification/)** format
- **[STAC API v1.0.0](https://github.com/radiantearth/stac-api-spec)** endpoints
- **[OGC API - Features](https://ogcapi.ogc.org/features/)** compatibility
- **[GeoJSON](https://geojson.org/)** response formats
- **[CQL2](https://docs.ogc.org/DRAFTS/21-065.html)** query language ([Filter extension](https://github.com/stac-api-extensions/filter))

## Next Steps

- **Reference > [API Overview](api.md)** - Human-readable API documentation
- **Guides > [Usage](../usage/index.md)** - Practical examples and tutorials
- **External > [STAC API Spec](https://github.com/radiantearth/stac-api-spec)** - Official specification
