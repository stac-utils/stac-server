#!/bin/sh

set -e

TEST_PATTERN=${1:-test-*.[jt]s}

export AWS_ACCESS_KEY_ID='none'
export AWS_SECRET_ACCESS_KEY='none'
export ENABLE_TRANSACTIONS_EXTENSION=true

echo "Running tests"
set +e
npx ava "./tests/system/${TEST_PATTERN}" --serial
TEST_RESULT="$?"
set -e

exit "$TEST_RESULT"
