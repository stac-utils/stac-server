#!/bin/bash

set -e

(cd src/lambdas/api && webpack)
(cd src/lambdas/ingest && webpack)

if [[ -n "${BUILD_PRE_HOOK}" ]]; then (cd src/lambdas/pre-hook && webpack); fi
if [[ -n "${BUILD_POST_HOOK}" ]]; then (cd src/lambdas/post-hook && webpack); fi
