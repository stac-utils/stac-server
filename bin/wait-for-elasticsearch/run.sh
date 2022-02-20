#!/bin/sh

set -e

D=$(dirname "$0")

echo 'Waiting for ElasticSearch'

timeout 60 "${D}/wait.sh"

echo 'Elasticsearch is up'
