#!/bin/sh

set -e

TEST_PATTERN=${1:-test-*.[jt]s}

export AWS_ACCESS_KEY_ID='none'
export AWS_SECRET_ACCESS_KEY='none'
export ENABLE_TRANSACTIONS_EXTENSION=true
export REQUEST_LOGGING_ENABLED=false
# export ENABLE_RESPONSE_COMPRESSION=false

echo "Running tests"
set +e

# add --match to restrict by test name
npx ava "./tests/system/${TEST_PATTERN}" --serial --verbose
TEST_RESULT="$?"
set -e

exit "$TEST_RESULT"
