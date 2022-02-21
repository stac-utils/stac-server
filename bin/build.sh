#!/bin/sh

set -e

for x in src/lambdas/*; do
  (cd "$x" && webpack)
done
