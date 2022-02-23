#!/bin/sh

set -e

D=$(dirname "$0")

echo 'Waiting for API'

timeout 60 "${D}/wait.sh"

echo 'API has started'
