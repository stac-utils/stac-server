/* eslint-disable new-cap */

'use strict'

const util = require('lambda-proxy-utils')
const satlib = require('@sat-utils/api-lib')


module.exports.handler = (event, context, cb) => {
  console.log(`API handler: ${JSON.stringify(event)}`)

  // function to send response to browser
  function respond(err, resp) {
    if (err) {
      console.log(err)
      const res = new util.Response({ cors: true, statusCode: 400 })
      return cb(null, res.send({ details: err.message }))
    }
    const res = new util.Response({ cors: true, statusCode: 200 })
    return cb(null, res.send(resp))
  }

  let msg

  // split and remove empty strings
  const resources = event.path.split('/').filter((x) => x)
  console.log('resources', resources)
  // make sure this is a STAC endpoint
  if (resources[0] !== 'stac') {
    msg = 'endpoint not defined (use /stac)'
    console.log(msg, resources)
    respond(null, msg)
    return
  }

  // determine endpoint
  let endpoint
  if ('X-Forwarded-Host' in event.headers) {
    endpoint = `${event.headers['X-Forwarded-Proto']}://${event.headers['X-Forwarded-Host']}`
  }
  else {
    endpoint = `${event.headers['X-Forwarded-Proto']}://${event.headers.Host}`
    if ('stage' in event.requestContext) {
      endpoint = `${endpoint}/${event.requestContext.stage}`
    }
  }

  // get payload
  const method = event.httpMethod
  const payload = { query: {}, headers: event.headers, endpoint: endpoint }
  if (method === 'POST' && event.body) {
    payload.query = JSON.parse(event.body)
  }
  else if (method === 'GET' && event.queryStringParameters) {
    payload.query = event.queryStringParameters
  }

  // /stac
  if (resources.length === 1) {
    msg = 'STAC catalog (see endpoints /search and /collections)'
    const catalog = {
      name: 'sat-api',
      description: 'A STAC API of public datasets',
      links: [
        { rel: 'self', href: `${endpoint}/stac` }
      ]
    }
    //respond(null, catalog)
    satlib.es.client().then((esClient) => {
      payload.query.limit = 100
      const api = new satlib.api(payload, esClient)
      api.search('collections', (err, results) => {
        if (err) respond(err)
        for (let col of results.collections) {
          catalog.links.push({rel: 'child', href: `${endpoint}/stac/collections/${col.name}`})
        }
        respond(null, catalog)
      })
    })
  } else {
    // drop the /stac prefix
    resources.splice(0, 1)
    // STAC endpoints
    switch (resources[0]) {
    case 'api':
      msg = 'TODO - return API doc'
      console.log(msg, resources)
      respond(null, msg)
      break
    // collections endpoint
    case 'collections':
      if (resources.length === 1) {
        // all collections
        satlib.es.client().then((esClient) => {
          payload.query.limit = 100
          const api = new satlib.api(payload, esClient)
          api.search('collections', respond)
        })
      } else if (resources.length === 2) {
        // specific collection
        satlib.es.client().then((esClient) => {
          const api = new satlib.api(payload, esClient)
          api.search('collections', (err, resp) => {
            if (resp.collections.length === 1) {
              resp = resp.collections[0]
            } else {
              resp = {}
            }
            respond(err, resp)
          })
        })
      } else if (resources[2] == 'items') {
        console.log('search items in this collection')
        // this is a search across items in this collection
        satlib.es.client().then((esClient) => {
          payload.query['cid'] = resources[1]
          const api = new satlib.api(payload, esClient)
          api.search_items(respond)
        })
      } else {
        msg = 'endpoint not defined'
        console.log(msg, resources)
        respond(null, msg)
      }
      break;
    case 'search':
      // items api
      satlib.es.client().then((esClient) => {
        const api = new satlib.api(payload, esClient)
        api.search_items(respond)
      })
      break
    default:
      respond(null, 'endpoint not defined')
    }
  }
}