#!/bin/sh

set -e

TEST_PATTERN=${1:-test-*.[jt]s}

export AWS_ACCESS_KEY_ID='none'
export AWS_SECRET_ACCESS_KEY='none'
export ENABLE_TRANSACTIONS_EXTENSION=true
export REQUEST_LOGGING_ENABLED=false
# export ENABLE_RESPONSE_COMPRESSION=false

# Force ALL Node processes (including AVA workers) to use tsx
export NODE_OPTIONS="--import=tsx"

echo "Running tests"
set +e

# add --match to restrict by test name
npx ava "tests/system/${TEST_PATTERN}" --serial --verbose --no-worker-threads
TEST_RESULT="$?"
set -e

exit "$TEST_RESULT"
