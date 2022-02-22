// @ts-check

const cors = require('cors')
const createError = require('http-errors')
const express = require('express')
const logger = require('morgan')
const path = require('path')
const satlib = require('../../lib')
const api = require('../../lib/api')
const { readYaml } = require('../../lib/fs')

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 * @typedef {import('express').ErrorRequestHandler} ErrorRequestHandler
 */

/**
 * @param {Request} req
 * @returns {string}
 */
const determineEndpoint = (req) => {
  if (process.env['STAC_API_URL']) return process.env['STAC_API_URL']

  if (req.get('X-Forwarded-Host')) {
    return `${req.get('X-Forwarded-Proto')}://${req.get('X-Forwarded-Host')}`
  }

  return req.event && req.event.requestContext && req.event.requestContext.stage
    ? `${req.get('X-Forwarded-Proto')}://${req.get('Host')}/${req.event.requestContext.stage}`
    : `${req.get('X-Forwarded-Proto')}://${req.get('Host')}`
}

/**
 * @param {Request} req
 * @param {Response} _res
 * @param {NextFunction} next
 * @returns {void}
 */
const addEndpointToRequest = (req, _res, next) => {
  req.endpoint = determineEndpoint(req)
  next()
}

const app = express()

app.use(logger('dev'))
app.use(cors())
app.use(express.json())
app.use(addEndpointToRequest)

app.get('/', async (req, res, next) => {
  try {
    res.json(await api.getCatalog(satlib.es, req.endpoint))
  } catch (error) {
    next(error)
  }
})

app.get('/api', async (_req, res, next) => {
  try {
    const spec = await readYaml(path.join(__dirname, 'api.yaml'))
    res.json(spec)
  } catch (error) {
    next(error)
  }
})

app.get('/conformance', async (_req, res, next) => {
  try {
    res.json(await api.getConformance())
  } catch (error) {
    next(error)
  }
})

app.get('/search', async (req, res, next) => {
  try {
    res.json(await api.searchItems(null, req.query, satlib.es, req.endpoint, 'GET'))
  } catch (error) {
    next(error)
  }
})

app.post('/search', async (req, res, next) => {
  try {
    res.json(await api.searchItems(null, req.body, satlib.es, req.endpoint, 'POST'))
  } catch (error) {
    next(error)
  }
})

app.get('/collections', async (req, res, next) => {
  try {
    res.json(await api.getCollections(satlib.es, req.endpoint))
  } catch (error) {
    next(error)
  }
})

app.get('/collections/:collectionId', async (req, res, next) => {
  try {
    const response = await api.getCollection(req.params.collectionId, satlib.es, req.endpoint)

    if (response instanceof Error) next(createError(404))
    else res.json(response)
  } catch (error) {
    next(error)
  }
})

app.get('/collections/:collectionId/items', async (req, res, next) => {
  try {
    res.json(await api.searchItems(
      req.params.collectionId,
      req.query,
      satlib.es,
      req.endpoint,
      'GET'
    ))
  } catch (error) {
    next(error)
  }
})

app.post('/collections/:collectionId/items', async (req, res, next) => {
  try {
    res.json(await api.searchItems(
      req.params.collectionId,
      req.body,
      satlib.es,
      req.endpoint,
      'POST'
    ))
  } catch (error) {
    next(error)
  }
})

app.get('/collections/:collectionId/items/:itemId', async (req, res, next) => {
  try {
    res.json(await api.getItem(
      req.params.collectionId,
      req.params.itemId,
      satlib.es,
      req.endpoint
    ))
  } catch (error) {
    next(error)
  }
})

app.patch('/collections/:collectionId/items/:itemId', async (req, res, next) => {
  if (!process.env['ENABLE_TRANSACTIONS_EXTENSION']) next(createError(404))
  else {
    try {
      res.json(await api.editPartialItem(req.params.itemId, req.body, satlib.es, req.endpoint))
    } catch (error) {
      next(error)
    }
  }
})

// catch 404 and forward to error handler
app.use((_req, _res, next) => {
  next(createError(404))
})

// error handler
app.use(
  /** @type {ErrorRequestHandler} */ ((err, _req, res, _next) => {
    res.status(err.status || 500)

    switch (err.status) {
    case 404:
      res.json({ error: 'Not Found' })
      break
    default:
      console.log(err)
      res.json({ error: 'Internal Server Error' })
      break
    }
  })
)

module.exports = { app }
