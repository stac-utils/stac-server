#!/bin/bash

# So, the new localstac requires ES to be initialized...
docker-compose up & aws --endpoint-url http://localhost:4566 es create-elasticsearch-domain --domain-name domain-test & while ! nc -z $DOCKER_NAME 4571; do sleep 1; done;
sleep 20;
node ./ingestCollections.js && node ./ingestData.js && yarn ava ./tests/integration/test_api.js
