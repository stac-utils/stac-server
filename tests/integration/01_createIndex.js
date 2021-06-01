process.env.ES_HOST = `http://${process.env.DOCKER_NAME}:4571`

const client = require('../../libs/esClient.js')

async function doCreate() {
  try {
    await client.create_index('collections')
  } catch (error) {
    console.log(error)
  }
}
doCreate()
