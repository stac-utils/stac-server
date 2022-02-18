const test = require('ava')
const es = require('../libs/es')

test('search id parameter doesnt override other parameters', async (t) => {
  const ids = 'a,b,c'
  const range = '2007-03-01T13:00:00Z/2008-05-11T15:30:00Z'
  const queryParams = {
    ids: ids,
    datetime: range
  }
  const searchBody = await es.constructSearchParams(queryParams, 1, 1)

  // TODO: the ordering here is fragile. helper methods needed to ensure the queries are correct
  t.is(
    searchBody.body.query.constant_score.filter.bool.must[0].terms.id,
    ids,
    'query contains id filter'
  )
  t.assert(
    searchBody.body.query.constant_score.filter.bool.must[1].range['properties.datetime'],
    'query contains datetime filter'
  )
})
