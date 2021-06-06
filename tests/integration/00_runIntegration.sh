#!/bin/bash

docker-compose up

# So, the new localstac requires ES to be initialized...
aws --endpoint-url http://localhost:4566 es create-elasticsearch-domain --domain-name domain-test

sleep 5

# TODO: Make the below an actual post initialization routine, right now manual
echo """
# wait for ES initialization to finish, then run
export DOCKER_NAME=localhost
node ./test/integrations/01_createIndex.js
node ./test/integrations/02_ingestCollections.js
node ./test/integrations/03_ingestData.js
npm run test_integrations
"""