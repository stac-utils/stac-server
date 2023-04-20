#!/usr/bin/env bash
set -Eeuo pipefail
set -x # print each command before exec

PATH=./node_modules/.bin:$PATH

STAC_API_VERSION='v1.0.0-rc.4'

curl "https://api.stacspec.org/${STAC_API_VERSION}/core/openapi.yaml" -o core.yaml
curl "https://api.stacspec.org/${STAC_API_VERSION}/collections/openapi.yaml" -o collections.yaml
curl "https://api.stacspec.org/${STAC_API_VERSION}/item-search/openapi.yaml" -o item-search.yaml
curl "https://api.stacspec.org/${STAC_API_VERSION}/ogcapi-features/openapi.yaml" -o ogcapi-features.yaml

yq eval-all '. as $item ireduce ({}; . * $item )' \
  core.yaml collections.yaml \
  ogcapi-features.yaml \
  item-search.yaml \
  > src/lambdas/api/openapi.yaml

rm core.yaml collections.yaml item-search.yaml ogcapi-features.yaml
