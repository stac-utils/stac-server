#!/bin/sh

set -e

export ES_HOST='http://localhost:9200'
export AWS_ACCESS_KEY_ID='none'
export AWS_SECRET_ACCESS_KEY='none'

./bin/wait-for-elasticsearch/run.sh

echo "Starting API"
node ./src/lambdas/api/local.js >/dev/null 2>&2 &
API_PID="$!"

./bin/wait-for-api/run.sh

echo "Running tests"
set +e
npx ava ./tests/system/test-*.js
TEST_RESULT="$?"
set -e

echo "Stopping API"
kill "$API_PID"

exit "$TEST_RESULT"
