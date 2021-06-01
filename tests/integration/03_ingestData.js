process.env.ES_HOST = `http://${process.env.DOCKER_NAME}:4571`

const stream = require('../../libs/esStream.js')
const ingest = require('../../libs/ingest.js')

const fs = require('fs')


async function doIngest() {
  [
    '../fixtures/stac/collection2_item.json',
    '../fixtures/stac/LC80100102015050LGN00.json',
    '../fixtures/stac/LC80100102015082LGN00.json'
  ].forEach(async (fixture) => {
    const data = fs.readFileSync(fixture)
    const item = JSON.parse(data)
    await ingest.ingestItem(item, stream)
  })
}
doIngest()
