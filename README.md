# stac-api 

![](https://github.com/stac-utils/stac-api/workflows/Push%20Event/badge.svg)

Stac-api is a STAC compliant Rest API for searching and serving metadata for geospatial data (including but not limited to satellite imagery).

The STAC version supported by a given version of stac-api is shown in the table below. Additional information can be found in the [CHANGELOG](CHANGELOG.md)

| sat-api | STAC  |
| -------- | ----  |
| 0.1.0    | 0.9.x |

## Deployed STAC APIs

The following APIs are deployed APIs using stac-api.

## Deployment

This repository contains Node libraries for running the API, along with a [serverless](https://serverless.com/) configuration file for deployment to AWS.

To deploy:

```
$ yarn
$ yarn build
$ yarn run deploy
```

### Environment variables

There are some environment variables used in the code. Some do not have defaults and must be set.

| Name | Description | Default Value |
| ---- | ----------- | ------------- |
| STAC_VERSION | STAC Version of this STAC API | 0.9.0 |
| STAC_ID | ID of this catalog | stac-api |
| STAC_TITLE | Title of this catalog | STAC API |
| STAC_DESCRIPTION | Description of this catalog | A STAC API |
| STAC_DOCS_URL | URL to documentation | [https://stac-utils.github.io/stac-api](https://stac-utils.github.io/stac-api) |
| STAC_API_URL | The root endpoint of this API to use for links | Inferred from request |
| ES_BATCH_SIZE | Number of records to ingest in single batch | 500 |
| LOG_LEVEL | Level for logging (CRITICAL, ERROR, WARNING, INFO, DEBUG) | INFO |


## Development

The latest released version is on the [master branch](https://github.com/sat-utils/sat-api/tree/master), and the latest development version is on the [develop](https://github.com/sat-utils/sat-api/tree/develop) branch.

### Building local version

    # Install dependencies in package.json
    $ yarn

    # Run the build command in each of the packages (runs webpack)
    $ yarn build

    # To continually watch and build source files
    $ yarn watch

    # To run tests for all packages
    $ yarn test

### Building API docs

    # To build API docs from the api spec
    $ yarn build-api-docs

## About

[stac-api](https://github.com/stac-utils/stac-api) was forked from [stac-api](https://github.com/sat-utils/sat-api). The stac-api is for STAC versions 0.9.0+, while sat-api exists for versions of STAC prior to 0.9.0.

### Unit Tests
```
$ yarn
$ yarn test
```

### Integration Tests
Navigate to the integration directory
```
$ cd ./tests/integration
```
Use the environment variable `DOCKER_NAME` to set your Docker host name.
Normally `localhost`.
```
$ export DOCKER_NAME=localhost
```
The AWS-SDK library also requires fake key fields to create a connection so set.
```
$ export AWS_ACCESS_KEY_ID=none
```
```
$ export AWS_SECRET_ACCESS_KEY=none
```
To run the tests
```
$ ./runIntegration.sh
```