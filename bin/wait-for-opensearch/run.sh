#!/bin/sh

set -e

D=$(dirname "$0")

echo 'Waiting for OpenSearch'

timeout 60 "${D}/wait.sh"

echo 'OpenSearch is up'
