#!/bin/sh

set -e

export AWS_ACCESS_KEY_ID='none'
export AWS_SECRET_ACCESS_KEY='none'

echo "Running tests"
set +e
npx ava ./tests/system/test-*.js
TEST_RESULT="$?"
set -e

exit "$TEST_RESULT"
