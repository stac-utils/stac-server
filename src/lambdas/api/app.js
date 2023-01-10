// @ts-check

const cors = require('cors')
const createError = require('http-errors')
const express = require('express')
const logger = require('morgan')
const path = require('path')
const database = require('../../lib/database')
const api = require('../../lib/api')
const { readFile } = require('../../lib/fs')
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
app.use(express.json({ limit: '1mb' }))
app.use(addEndpoint)

app.get('/', async (req, res, next) => {
  try {
    res.json(await api.getCatalog(txnEnabled, database, req.endpoint))
  } catch (error) {
    next(error)
  }
})

app.get('/healthcheck', async (_req, res, next) => {
  try {
    res.json(await api.healthCheck(database))
  } catch (error) {
    next(error)
  }
})

app.get('/api', async (_req, res, next) => {
  try {
    res.type('application/vnd.oai.openapi')
    res.download(path.join(__dirname, 'openapi.yaml'))
  } catch (error) {
    next(error)
  }
})

app.get('/api.html', async (_req, res, next) => {
  try {
    res.type('text/html')
    res.send(await readFile(path.join(__dirname, 'redoc.html'), 'utf8'))
  } catch (error) {
    next(error)
  }
})

app.get('/conformance', async (_req, res, next) => {
  try {
    res.json(await api.getConformance(txnEnabled))
  } catch (error) {
    next(error)
  }
})

app.get('/search', async (req, res, next) => {
  try {
    res.type('application/geo+json')
    res.json(await api.searchItems(null, req.query, database, req.endpoint, 'GET'))
  } catch (error) {
    if (error instanceof api.ValidationError) {
      next(createError(400, error.message))
    } else {
      next(error)
    }
  }
})

app.post('/search', async (req, res, next) => {
  try {
    res.type('application/geo+json')
    res.json(await api.searchItems(null, req.body, database, req.endpoint, 'POST'))
  } catch (error) {
    if (error instanceof api.ValidationError) {
      next(createError(400, error.message))
    } else {
      next(error)
    }
  }
})

app.get('/aggregate', async (req, res, next) => {
  try {
    res.json(await api.aggregate(req.query, database, req.endpoint, 'GET'))
  } catch (error) {
    if (error instanceof api.ValidationError) {
      next(createError(400, error.message))
    } else {
      next(error)
    }
  }
})

app.post('/aggregate', async (req, res, next) => {
  try {
    res.json(await api.aggregate(req.body, database, req.endpoint, 'POST'))
  } catch (error) {
    if (error instanceof api.ValidationError) {
      next(createError(400, error.message))
    } else {
      next(error)
    }
  }
})

app.get('/collections', async (req, res, next) => {
  try {
    res.json(await api.getCollections(database, req.endpoint))
  } catch (error) {
    next(error)
  }
})

app.post('/collections', async (req, res, next) => {
  if (txnEnabled) {
    const collectionId = req.body.collection
    try {
      await api.createCollection(req.body, database)
      res.location(`${req.endpoint}/collections/${collectionId}`)
      res.sendStatus(201)
    } catch (error) {
      if (error instanceof Error
              && error.name === 'ResponseError'
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

app.get('/collections/:collectionId', async (req, res, next) => {
  const { collectionId } = req.params
  try {
    const response = await api.getCollection(collectionId, database, req.endpoint)

    if (response instanceof Error) next(createError(404))
    else res.json(response)
  } catch (error) {
    next(error)
  }
})

app.get('/collections/:collectionId/items', async (req, res, next) => {
  const { collectionId } = req.params
  try {
    const response = await api.getCollection(collectionId, database, req.endpoint)

    if (response instanceof Error) next(createError(404))
    else {
      const items = await api.searchItems(
        collectionId,
        req.query,
        database,
        req.endpoint,
        'GET'
      )
      res.type('application/geo+json')
      res.json(items)
    }
  } catch (error) {
    if (error instanceof api.ValidationError) {
      next(createError(400, error.message))
    } else {
      next(error)
    }
  }
})

app.post('/collections/:collectionId/items', async (req, res, next) => {
  if (txnEnabled) {
    const { collectionId } = req.params
    const itemId = req.body.id

    if (req.body.collection && req.body.collection !== collectionId) {
      next(createError(400, 'Collection resource URI must match collection in body'))
    } else {
      const collectionRes = await api.getCollection(collectionId, database, req.endpoint)
      if (collectionRes instanceof Error) next(createError(404))
      try {
        req.body.collection = collectionId
        await api.createItem(req.body, database)
        res.location(`${req.endpoint}/collections/${collectionId}/items/${itemId}`)
        res.sendStatus(201)
      } catch (error) {
        if (error instanceof Error
              && error.name === 'ResponseError'
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
    const { itemId, collectionId } = req.params

    const response = await api.getItem(
      collectionId,
      itemId,
      database,
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

    if (req.body.collection && req.body.collection !== collectionId) {
      next(createError(400, 'Collection ID in resource URI must match collection in body'))
    } else if (req.body.id && req.body.id !== itemId) {
      next(createError(400, 'Item ID in resource URI must match id in body'))
    } else {
      const itemRes = await api.getItem(collectionId, itemId, database, req.endpoint)
      if (itemRes instanceof Error) next(createError(404))
      else {
        req.body.collection = collectionId
        req.body.id = itemId
        try {
          await api.updateItem(req.body, database)
          res.sendStatus(204)
        } catch (error) {
          if (error instanceof Error
                  && error.name === 'ResponseError'
                  && error.message.includes('version_conflict_engine_exception')) {
            res.sendStatus(409)
          } else {
            next(error)
          }
        }
      }
    }
  } else {
    next(createError(404))
  }
})

app.patch('/collections/:collectionId/items/:itemId', async (req, res, next) => {
  if (txnEnabled) {
    const { collectionId, itemId } = req.params

    if (req.body.collection && req.body.collection !== collectionId) {
      next(createError(400, 'Collection ID in resource URI must match collection in body'))
    } else if (req.body.id && req.body.id !== itemId) {
      next(createError(400, 'Item ID in resource URI must match id in body'))
    } else {
      const itemRes = await api.getItem(collectionId, itemId, database, req.endpoint)
      if (itemRes instanceof Error) next(createError(404))
      else {
        try {
          //const item =
          await api.partialUpdateItem(
            collectionId, itemId, req.body, database, req.endpoint
          )
          // res.type('application/geo+json')
          // res.json(item)
          res.sendStatus(204)
        } catch (error) {
          next(error)
        }
      }
    }
  } else {
    next(createError(404))
  }
})

app.delete('/collections/:collectionId/items/:itemId', async (req, res, next) => {
  if (txnEnabled) {
    const { collectionId, itemId } = req.params
    try {
      const response = await api.deleteItem(collectionId, itemId, database)
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

app.get('/collections/:collectionId/items/:itemId/thumbnail', async (req, res, next) => {
  try {
    const { itemId, collectionId } = req.params

    const response = await api.getItemThumbnail(
      collectionId,
      itemId,
      database,
    )

    if (response instanceof Error) {
      if (response.message === 'Item not found'
          || response.message === 'Thumbnail not found') {
        next(createError(404))
      } else {
        next(createError(500))
      }
    } else {
      res.redirect(response.location)
    }
  } catch (error) {
    next(error)
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
