# Migrating from v4.x -> v5.0.0

## Using old index naming method for existing collections

stac-server version 5 introduced a breaking change in how OpenSearch indices for STAC Collections are named. This means that
existing OpenSearch clusters created with stac-server v4 or earlier will not work without manually overriding the index names.
The following process will let users use unmodified OpenSearch clusters with newer versions of stac-server.

```
curl $STAC_SERVER/collections | jq '.collections | map({(.id): .id}) | map(to_entries) | flatten | from_entries'
filter out collections already in $COLLECTION_TO_INDEX_MAPPINGS
append filtered dict to $COLLECTION_TO_INDEX_MAPPINGS
```

`$COLLECTION_TO_INDEX_MAPPINGS` will ensure that stac-server doesn't mangle these collection names when making database queries.
