#!/bin/sh

set -e

D=$(dirname "$0")

echo 'Waiting for Serverless Offline'

timeout 60 "${D}/wait.sh"

echo 'Serverless Offline has started'
