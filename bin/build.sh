#!/bin/sh

set -e

for x in src/lambdas/*; do
  if [ "$x" != "src/lambdas/pre-hook" ] && [ "$x" != "src/lambdas/post-hook" ]; then
    (cd "$x" && webpack)
  fi
done
