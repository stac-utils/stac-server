# Tests

## Test types

`stac-server` is tested using a few different types of tests. For the case of this project, they are:

- **system tests** - These are black-box tests that only interact with the system through public APIs: the HTTP REST API and the ingest SNS topic. They depend on an Elasticsearch/OpenSearch server and Localstack.
- **integration tests** - These tests depend on either Elasticsearch/OpenSearch or Localstack, but are not black-box tests. They may call functions directly.
- **unit tests** - These tests are self-contained and should not depend on anything else running. They should not require Elasticsearch/OpenSearch, Localstack, or any other network resources.

## Directory structure

- **aws** - tests that run against AWS. Used for testing pre- and post-hooks
- **fixtures** - static files used during tests, such as items to be ingested
- **helpers** - helper modules used in tests
- **integration** - integration tests
- **system** - system tests
- **unit** - unit tests

## AWS tests

The pre- and post-hook functionality involves the app lambda invoking other lambda functions. That turned out to be difficult to test. LocalStack's lambda service had a lot of deficiencies, and mocking those calls wasn't really useful. It's important to make sure that we're really getting the inputs and outputs that we expect from the lambda service.

The pre- and post-hook tests depend on a number of lambda functions being deployed to AWS. Those lambda functions are configured in `tests/aws/cf.yml`. Once they've been deployed, the tests can be run with:

```sh
env AWS_REGION=us-east-1 npm exec ava -- tests/aws/
```

Note that the `AWS_REGION` environment variable needs to be set.
