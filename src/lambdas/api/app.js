// @ts-check

const compression = require('compression')
const cors = require('cors')
const createError = require('http-errors')
const express = require('express')
const logger = require('morgan')
const path = require('path')
const satlib = require('../../lib')
const api = require('../../lib/api')
const { readYaml } = require('../../lib/fs')
const { addEndpoint } = require('./middleware/add-endpoint')

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 * @typedef {import('express').ErrorRequestHandler} ErrorRequestHandler
 */

const txnEnabled = process.env['ENABLE_TRANSACTIONS_EXTENSION'] === 'true'

const app = express()

app.use(logger('dev'))
app.use(cors())
app.use(express.json())
app.use(compression())
app.use(addEndpoint)

app.get('/', async (req, res, next) => {
  try {
    res.json(await api.getCatalog(satlib.es, req.endpoint))
  } catch (error) {
    next(error)
  }
})

app.get('/api', async (_req, res, next) => {
  try {
    res.type('application/vnd.oai.openapi')
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
    res.type('application/geo+json')
    res.json(await api.searchItems(null, req.query, satlib.es, req.endpoint, 'GET'))
  } catch (error) {
    next(error)
  }
})

app.post('/search', async (req, res, next) => {
  try {
    res.type('application/geo+json')
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
    const response = await api.getCollection(req.params.collectionId, satlib.es, req.endpoint)

    if (response instanceof Error) next(createError(404))
    else {
      const items = await api.searchItems(
        req.params.collectionId,
        req.query,
        satlib.es,
        req.endpoint,
        'GET'
      )
      res.type('application/geo+json')
      res.json(items)
    }
  } catch (error) {
    next(error)
  }
})

app.post('/collections/:collectionId/items', async (req, res, next) => {
  if (txnEnabled) {
    const { collectionId } = req.params
    const itemId = req.body.id

    if (collectionId !== req.body.collection) {
      next(createError(400, 'Collection resource URI must match collection in body'))
    } else {
      const collectionRes = await api.getCollection(collectionId, satlib.es, req.endpoint)
      if (collectionRes instanceof Error) next(createError(404))
      try {
        await api.createItem(req.body, satlib.es)
        res.location(`${req.endpoint}/collections/${collectionId}/items/${itemId}`)
        res.sendStatus(201)
      } catch (error) {
        if (error.name === 'ResponseError'
              && error.message.includes('version_conflict_engine_exception')) {
          res.sendStatus(409)
        } else {
          next(error)
        }
      }
    }
  } else {
    next(createError(404))
  }
})

app.get('/collections/:collectionId/items/:itemId', async (req, res, next) => {
  try {
    const response = await api.getItem(
      req.params.collectionId,
      req.params.itemId,
      satlib.es,
      req.endpoint
    )

    if (response instanceof Error) {
      if (response.message === 'Item not found') {
        next(createError(404))
      } else {
        next(createError(500))
      }
    } else {
      res.type('application/geo+json')
      res.json(response)
    }
  } catch (error) {
    next(error)
  }
})

app.put('/collections/:collectionId/items/:itemId', async (req, res, next) => {
  if (txnEnabled) {
    const { collectionId, itemId } = req.params

    // If allowing PUT to move, get rid of this check
    if (collectionId !== req.body.collection) {
      next(createError(400, 'Collection resource URI must match collection in body'))
    }

    if (itemId !== req.body.id) {
      next(createError(400, 'Item resource URI must match Item ID in body'))
    }

    const collectionRes = await api.getCollection(collectionId, satlib.es, req.endpoint)
    if (collectionRes instanceof Error) next(createError(404))

    try {
      await api.updateItem(req.body, satlib.es)
      res.sendStatus(204)
    } catch (error) {
      if (error.name === 'ResponseError'
            && error.message.includes('version_conflict_engine_exception')) {
        res.sendStatus(409)
      } else {
        next(error)
      }
    }
  } else {
    next(createError(404))
  }
})

app.patch('/collections/:collectionId/items/:itemId', async (req, res, next) => {
  if (txnEnabled) {
    const collectionRes = await api.getCollection(req.params.collectionId, satlib.es, req.endpoint)
    if (collectionRes instanceof Error) next(createError(404))
    else {
      try {
        res.json(await api.partialUpdateItem(
          req.params.collectionId, req.params.itemId, req.body, satlib.es, req.endpoint
        ))
      } catch (error) {
        next(error)
      }
    }
  } else {
    next(createError(404))
  }
})

app.delete('/collections/:collectionId/items/:itemId', async (req, res, next) => {
  if (txnEnabled) {
    try {
      const response = await api.deleteItem(req.params.collectionId, req.params.itemId, satlib.es)
      if (response instanceof Error) next(createError(500))
      else {
        res.sendStatus(204)
      }
    } catch (error) {
      next(error)
    }
  } else {
    next(createError(404))
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

    res.type('application/json')

    switch (err.status) {
    case 400:
      res.json({ code: 'BadRequest', description: err.message })
      break
    case 404:
      res.json({ code: 'NotFound', description: 'Not Found' })
      break
    default:
      console.log(err)
      res.json({ code: 'InternalServerError', description: 'Internal Server Error' })
      break
    }
  })
)

module.exports = { app }
