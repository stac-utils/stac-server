#!/bin/sh

set -e

./bin/wait-for-elasticsearch/run.sh

echo "Setting up Elasticsearch"
node ./tests/integration/setup-es.js

echo "Configuring serverless-offline"
if [ -e serverless.yml ]; then
  mv serverless.yml serverless.yml.original
fi

grep -v 'ElasticSearchInstance, DomainEndpoint' serverless.yml.example |\
  sed 's/ES_HOST.*/ES_HOST: http:\/\/localhost:9200/' > serverless.yml

echo "Starting serverless-offline"
npx serverless offline start >/dev/null 2>&2 &
SERVERLESS_PID="$!"

./bin/wait-for-serverless-offline/run.sh

echo "Running tests"
set +e
npx ava ./tests/integration/test_*.js
TEST_RESULT="$?"
set -e

echo "Stopping serverless-offline"
kill "$SERVERLESS_PID"

if [ -e serverless.yml.original ]; then
  mv serverless.yml.original serverless.yml
fi

exit "$TEST_RESULT"
