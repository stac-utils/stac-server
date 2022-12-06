#!/bin/sh

is_es_up () {
  curl -s -X GET "http://127.0.0.1:9200/_cluster/health" |\
    grep -E '"status":"(green|yellow)"' > /dev/null 2>&1
}

while ! is_es_up; do sleep 1; done
