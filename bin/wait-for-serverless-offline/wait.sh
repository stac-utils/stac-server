#!/bin/sh

is_serverless_offline_running () {
  curl -s -X GET "http://127.0.0.1:3000/dev/" > /dev/null 2>&1
}

while ! is_serverless_offline_running; do sleep 1; done
