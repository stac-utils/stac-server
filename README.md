# stac-server 

![](https://github.com/stac-utils/stac-server/workflows/Push%20Event/badge.svg)

Stac-server is a STAC compliant Rest API for searching and serving metadata for geospatial data (including but not limited to satellite imagery). The STAC version supported by a given version of stac-api is shown in the table below. Additional information can be found in the [CHANGELOG](CHANGELOG.md)

| stac-server Version | STAC Version  |
| -------- | ---------- |
| 0.1.x    | 0.9.x      |
| 0.2.x    | <1.0.0-rc.1 |
| 0.3.x    | 1.0.0 |

The following APIs are deployed instances of stac-server:

| Name     | Version   | Description |
| -------- | ----      | ----        |
| [Earth Search](https://earth-search.aws.element84.com/v0/) | 1.0.0-beta.2 | Catalog of some AWS Public Datasets |


## Usage

Stac-server is a RESTful API that returns JSON, see the [documentation](http://stac-utils.github.io/stac-server), or the /api endpoint which is a self-documenting OpenAPI document. Here are some additional tools that might prove useful:

- [JSONView Chrome Extension](https://chrome.google.com/webstore/detail/jsonview/chklaanhfefbnpoihckbnefhakgolnmc?hl=en): Useful for exploring the API in the browser.
- [sat-search](https://github.com/sat-utils/sat-search): A Python client library and CLI for searching a STAC compliant API
- [sat-fetch](https://github.com/sat-utils/sat-fetch): A Python client library and CLI for fetching areas of interest and creating stacked clipped imagery from a STAC catalog that has Cloud-Optimized GeoTiff (COG) assets.


## Deployment

This repository contains Node libraries for running the API, along with a [serverless](https://serverless.com/) configuration file for deployment to AWS.

To create your own deployment of stac-server, first clone the repository:

```
$ git clone https://github.com/stac-utils/stac-server.git
$ cd stac-server
```

There are some settings that should be reviewed and updated as needeed in the [serverless config file](serverless.yml), under provider->environment:

| Name | Description | Default Value |
| ---- | ----------- | ------------- |
| STAC_VERSION | STAC Version of this STAC API | 1.0.0 |
| STAC_API_VERSION | STAC API Version of this STAC API | 1.0.0-beta.1 |
| STAC_ID | ID of this catalog | stac-server |
| STAC_TITLE | Title of this catalog | STAC API |
| STAC_DESCRIPTION | Description of this catalog | A STAC API |
| STAC_DOCS_URL | URL to documentation | [https://stac-utils.github.io/stac-server](https://stac-utils.github.io/stac-server) |
| ES_BATCH_SIZE | Number of records to ingest in single batch | 500 |
| LOG_LEVEL | Level for logging (CRITICAL, ERROR, WARNING, INFO, DEBUG) | INFO |
| STAC_API_URL | The root endpoint of this API | Inferred from request |
| ENABLE_TRANSACTIONS_EXTENSION | Boolean specifying if the [Transaction Extension](https://github.com/radiantearth/stac-api-spec/tree/master/extensions/transaction) should be activated | false |

After reviewing the settings, build and deploy the project.

```
$ npm install
$ npm run build
$ npm run deploy
```

This will create a CloudFormation stack in the `us-west-2` region called `stac-server-dev`. To change the region or the stage name (from `dev`) provide arguments to the deploy command (note the additional `--` in the command, required by `npm` to provide arguments):

```
$ npm run deploy -- --stage mystage --region eu-central-1
```

Once deployed there is one final step - creating the indices and mappings in Elasticsearch. Invoke the `stac-server-<stage>-ingest` Lambda function (either through the AWS Console or the AWS CLI) with a payload of:

```
{
    "create_indices": true
}
```

Stac-server is now ready to ingest data!

## Ingesting Data

STAC Collections and Items are ingested by the `ingest` Lambda function, however this Lambda is not invoked directly by a user, it consumes records from the `stac-server-<stage>-queue` SQS. To add STAC Items or Collections to the queue, publish them to the SNS Topic `stac-server-<stage>-ingest`.

STAC Collections should be ingested before Items that belong to that Collection. Items should have the `collection` field populated with the ID of an existing Collection.

### Subscribing to SNS Topics

Stac-server can also be subscribed to SNS Topics that publish complete STAC Items as their message. This provides a way to keep stac-server up to date with new data. Use the AWS Lambda console for the function `stac-server-<stage>-subscibe-to-sns` to subscribe to an SNS Topic for which you have the full ARN and permission to subscribe to. This could be an SNS Topic you created yourself to publish STAC records to, or a publicly available one, such as for [Sentinel](https://github.com/sat-utils/sat-stac-sentinel).

*Note*, that adding the subscription via the topic page does not seem to work. Instead, add a trigger on Lambda edit page.

### Ingest Errors

Errors that occur during ingest will end up in the dead letter processing queue, where they are processed by the `stac-server-<stage>-failed-ingest` Lambda function. Currently all the failed-ingest Lambda does is log the error, see the CloudWatch log `/aws/lambda/stac-server-<stage>-failed-ingest` for errors.

## Development


```
# Install dependencies in package.json
$ npm install

# Run the build command in each of the packages (runs webpack)
$ npm run build

# To run tests for all packages
$ npm run test

# To build API docs from the api spec
$ npm run build-api-docs
```

## About

[stac-server](https://github.com/stac-utils/stac-server) was forked from [sat-api](https://github.com/sat-utils/sat-api). Stac-server is for STAC versions 0.9.0+, while sat-api exists for versions of STAC prior to 0.9.0.
