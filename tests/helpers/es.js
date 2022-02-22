// @ts-check

const { connect } = require('../../src/lib/esClient')

const refreshIndices = async () => {
  const esClient = await connect()
  await esClient.indices.refresh({ index: '_all' })
}

module.exports = {
  refreshIndices
}
