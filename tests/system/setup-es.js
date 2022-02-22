const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const client = require('../../src/lib/esClient')
const ingest = require('../../src/lib/ingest')
const stream = require('../../src/lib/esStream')

const readFile = promisify(fs.readFile)

const loadJson = async (filename) => {
  const filePath = path.join(__dirname, '..', 'fixtures', 'stac', filename)

  const data = await readFile(filePath)
  return JSON.parse(data)
}

const main = async () => {
  const esClient = await client.client()

  await esClient.indices.delete({ index: '*' })

  await client.createIndex('collections')

  const fixtureFiles = [
    'catalog.json',
    'collection.json',
    'collection2.json',
    'collection2_item.json',
    'LC80100102015050LGN00.json',
    'LC80100102015082LGN00.json'
  ]

  const items = await Promise.all(fixtureFiles.map((x) => loadJson(x)))

  await ingest.ingestItems(items, stream)
}

main()
  .catch((err) => {
    console.log(err)
    process.exitCode = 1
  })
