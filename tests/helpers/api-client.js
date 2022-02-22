const got = require('got')

const apiClient = got.extend({
  prefixUrl: 'http://localhost:3000/dev/',
  headers: {
    'X-Forwarded-Proto': 'http'
  },
  responseType: 'json',
  resolveBodyOnly: true
})

const getCollectionIds = async () => {
  const response = await apiClient.get('collections')

  return response.collections.map((c) => c.id)
}

module.exports = {
  apiClient,
  getCollectionIds
}
