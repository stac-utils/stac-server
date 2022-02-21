# Tests

## Test types

`stac-server` is tested using a few different types of tests. For the case of this project, they are:

- **system tests** - These are black-box tests that only interact with the system through public APIs: the HTTP REST API and the ingest SNS topic. They depend on an Elasticsearch server and Localstack.
- **integration tests** - These tests depend on either Elasticsearch or Localstack, but are not black-box tests. They may call functions directly.
- **unit tests** - These tests are self-contained and should not depend on anything else running. They should not require Elasticsearch, Localstack, or any other network resources.

## Directory structure

- **fixtures** - static files used during tests, such as items to be ingested
- **helpers** - helper modules used in tests
- **integration** - integration tests
- **system** - system tests
- **unit** - unit tests
