import cors from 'cors'
import createError from 'http-errors'
import express from 'express'
import compression from 'compression'
import morgan from 'morgan'
import path from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import database from '../../lib/database.js'
import api from '../../lib/api.js'
import { NotFoundError, ValidationError } from '../../lib/errors.js'
import { readFile } from '../../lib/fs.js'
import addEndpoint from './middleware/add-endpoint.js'
import logger from '../../lib/logger.js'
import { AssetProxy } from '../../lib/asset-proxy.js'
import { TransactionPostRequest, SearchCollectionItemsPostRequest } from '../../lib/models.js'

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 * @typedef {import('express').ErrorRequestHandler} ErrorRequestHandler
 */

export const createApp = async () => {
  const txnEnabled = process.env['ENABLE_TRANSACTIONS_EXTENSION'] === 'true'

  const app = express()

  app.locals['assetProxy'] = await AssetProxy.create()

  if (process.env['REQUEST_LOGGING_ENABLED'] !== 'false') {
    app.use(
      [
        // Setting `immediate: true` allows us to log at request start
        // in case the lambda times out it's helpful to have the request ID
        // Using console out will allow us to capture the request ID from lambda
        morgan('Request Start - :method :url',
          { immediate: true, stream: { write: (message) => console.info(`${message}`) } }),
        // Logs at the end of the request
        // Using console out will allow us to capture the request ID from lambda
        morgan(process.env['REQUEST_LOGGING_FORMAT'] || 'tiny',
          { stream: { write: (message) => console.info(message) } })
      ]
    )
  }

  app.use(cors({
    origin: process.env['CORS_ORIGIN'] || '*',
    credentials: process.env['CORS_CREDENTIALS'] === 'true',
    methods: process.env['CORS_METHODS'] || 'GET,HEAD,PUT,PATCH,POST,DELETE', // default
    allowedHeaders: process.env['CORS_HEADERS'] || '',
  }))

  app.use(express.json({ limit: '1mb' }))

  if (process.env['ENABLE_RESPONSE_COMPRESSION'] !== 'false') {
    app.use(compression())
  }

  app.use(addEndpoint)

  app.get('/', async (req, res, next) => {
    try {
      const response = await api.getCatalog(txnEnabled, req.endpoint)
      if (response instanceof Error) next(createError(500, response.message))
      else res.json(response)
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

  const pathName = process.env['LAMBDA_TASK_ROOT']
    ? process.env['LAMBDA_TASK_ROOT'] : path.dirname(fileURLToPath(import.meta.url))

  app.get('/api', async (_req, res, next) => {
    try {
      res.type('application/vnd.oai.openapi')
      res.download(path.resolve(pathName, 'openapi.yaml'))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api.html', async (_req, res, next) => {
    try {
      res.type('text/html')
      res.send(await readFile(path.resolve(pathName, 'redoc.html'), 'utf8'))
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

  app.get('/queryables', async (req, res, next) => {
    try {
      res.type('application/schema+json')
      res.json(await api.getGlobalQueryables(req.endpoint))
    } catch (error) {
      next(error)
    }
  })

  app.get('/search', async (req, res, next) => {
    try {
      const result = await api.searchItems(
        database, 'GET', null, req.endpoint, req.query, req.headers
      )
      req.app.locals['assetProxy'].updateAssetHrefs(result.features, req.endpoint)
      res.type('application/geo+json')
      res.json(result)
    } catch (error) {
      if (error instanceof ValidationError) {
        next(createError(400, error.message))
      } else {
        next(error)
      }
    }
  })

  app.post('/search', async (req, res, next) => {
    try {
      const result = await api.searchItems(
        database, 'POST', null, req.endpoint, req.body, req.headers
      )
      req.app.locals['assetProxy'].updateAssetHrefs(result.features, req.endpoint)
      res.type('application/geo+json')
      res.json(result)
    } catch (error) {
      if (error instanceof ValidationError) {
        next(createError(400, error.message))
      } else {
        next(error)
      }
    }
  })

  app.get('/aggregate', async (req, res, next) => {
    try {
      res.json(await api.aggregate(database, 'GET', null, req.endpoint, req.query, req.headers))
    } catch (error) {
      if (error instanceof ValidationError) {
        next(createError(400, error.message))
      } else {
        next(error)
      }
    }
  })

  app.get('/aggregations', async (req, res, next) => {
    try {
      res.json(await api.getGlobalAggregations(req.endpoint))
    } catch (error) {
      next(error)
    }
  })

  app.get('/collections', async (req, res, next) => {
    try {
      const response = await api.getCollections(database, req.endpoint, req.query, req.headers)
      if (response instanceof Error) next(createError(500, response.message))
      else {
        req.app.locals['assetProxy'].updateAssetHrefs(response.collections, req.endpoint)
        res.json(response)
      }
    } catch (error) {
      next(error)
    }
  })

  app.post('/collections', async (req, res, next) => {
    if (txnEnabled) {
      const collectionId = req.body.collection
      try {
        await api.createCollection(database, req.body)
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
      const response = await api.getCollection(
        database, collectionId, req.endpoint, req.query, req.headers
      )
      if (response instanceof Error) next(createError(404))
      else {
        req.app.locals['assetProxy'].updateAssetHrefs([response], req.endpoint)
        res.json(response)
      }
    } catch (error) {
      next(error)
    }
  })

  app.get('/collections/:collectionId/queryables', async (req, res, next) => {
    const { collectionId } = req.params
    try {
      const queryables = await api.getCollectionQueryables(
        database, collectionId, req.endpoint, req.query, req.headers
      )

      if (queryables instanceof Error) next(createError(404))
      else {
        res.type('application/schema+json')
        res.json(queryables)
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        next(createError(400, error.message))
      } else {
        next(error)
      }
    }
  })

  app.get('/collections/:collectionId/aggregations', async (req, res, next) => {
    const { collectionId } = req.params
    try {
      const aggs = await api.getCollectionAggregations(
        database, collectionId, req.endpoint, req.query, req.headers
      )
      if (aggs instanceof Error) next(createError(404))
      else res.json(aggs)
    } catch (error) {
      if (error instanceof ValidationError) {
        next(createError(400, error.message))
      } else {
        next(error)
      }
    }
  })

  app.get('/collections/:collectionId/aggregate',
    async (req, res, next) => {
      const { collectionId } = req.params
      try {
        const response = await api.getCollection(
          database, collectionId, req.endpoint, req.query, req.headers
        )

        if (response instanceof Error) next(createError(404))
        else {
          res.json(
            await api.aggregate(
              database, 'GET', collectionId, req.endpoint, req.query, req.headers
            )
          )
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          next(createError(400, error.message))
        } else {
          next(error)
        }
      }
    })

  app.get('/collections/:collectionId/items', async (req, res, next) => {
    const { collectionId } = req.params
    try {
      if (
        (await api.getCollection(database, collectionId, req.endpoint, req.query, req.headers)
        ) instanceof Error) {
        next(createError(404))
      }

      const result = await api.searchItems(
        database, 'GET', collectionId, req.endpoint, req.query, req.headers
      )
      req.app.locals['assetProxy'].updateAssetHrefs(result.features, req.endpoint)
      res.type('application/geo+json')
      res.json(result)
    } catch (error) {
      if (error instanceof ValidationError) {
        next(createError(400, error.message))
      } else {
        next(error)
      }
    }
  })

  async function transactionPost(req, res, next) {
    const { collectionId } = req.params
    const itemId = req.body.id

    if (req.body.collection && req.body.collection !== collectionId) {
      next(createError(400, 'Collection resource URI must match collection in body'))
    } else {
      const collectionRes = await api.getCollection(
        database, collectionId, req.endpoint, req.query, req.headers
      )
      if (collectionRes instanceof Error) next(createError(404))
      else {
        try {
          req.body.collection = collectionId
          await api.createItem(database, req.body)
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
        } else if (req.body.type === 'FeatureCollection') {
          const duplicateItemErrors = []
          let itemsCreated = 0
          for (const item of req.body.features) {
            try {
              item.collection = collectionId
              await api.createItem(database, item) // eslint-disable-line no-await-in-loop
              itemsCreated += 1
            } catch (error) {
              if (error instanceof Error
                  && error.name === 'ResponseError'
                  && error.message.includes('version_conflict_engine_exception')) {
                duplicateItemErrors.push(item)
              } else {
                next(error)
              }
            }
          }
          if (duplicateItemErrors.length) {
            res.status(409).send(
              `${itemsCreated} items created. `
              + `The following items were duplicates and not inserted: ${duplicateItemErrors}`
            )
          } else {
            res.sendStatus(201)
          }
        }
      }
    }
  }

  async function searchPost(req, res, next) {
    // Mimic /search endpoint body with single collection
    const { collectionId } = req.params
    const body = req.body
    body.collections = [collectionId]

    try {
      const result = await api.searchItems(
        database, 'POST', null, req.endpoint, req.body, req.headers
      )
      req.app.locals['assetProxy'].updateAssetHrefs(result.features, req.endpoint)
      res.type('application/geo+json')
      res.json(result)
    } catch (error) {
      if (error instanceof ValidationError) {
        next(createError(400, error.message))
      } else {
        next(error)
      }
    }
  }

  app.post('/collections/:collectionId/items', async (req, res, next) => {
    try {
      if (txnEnabled) {
        TransactionPostRequest.parse(req.body)
        await transactionPost(req, res, next)
      } else {
        SearchCollectionItemsPostRequest.parse(req.body)
        await searchPost(req, res, next)
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const expectedEndpoint = txnEnabled ? 'transaction' : 'search'
        const otherEndpoint = txnEnabled ? 'search' : 'transaction'
        const message = `Payload is not a valid ${expectedEndpoint} request. `
          + `This API is configured to use this URL for a ${expectedEndpoint} endpoint, `
          + `although it is common for it to be used as a ${otherEndpoint} endpoint.`
        const parsingErrors = error.issues
        res.status(400).json({
          code: 'BadRequest',
          message,
          parsingErrors
        })
      } else {
        next(error)
      }
    }
  })

  app.get('/collections/:collectionId/items/:itemId', async (req, res, next) => {
    try {
      const { itemId, collectionId } = req.params

      const response = await api.getItem(
        database,
        collectionId,
        itemId,
        req.endpoint,
        req.query,
        req.headers,
      )

      if (response instanceof NotFoundError) {
        next(createError(404))
      } else if (response instanceof Error) {
        next(createError(500))
      } else {
        req.app.locals['assetProxy'].updateAssetHrefs([response], req.endpoint)
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
        const itemRes = await api.getItem(
          database, collectionId, itemId, req.endpoint, req.query, req.headers
        )

        if (itemRes instanceof Error) next(createError(404))
        else {
          req.body.collection = collectionId
          req.body.id = itemId
          try {
            await api.updateItem(database, req.body)
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
        const itemRes = await api.getItem(
          database, collectionId, itemId, req.endpoint, req.query, req.headers
        )
        if (itemRes instanceof Error) next(createError(404))
        else {
          try {
            //const item =
            await api.partialUpdateItem(database,
              collectionId,
              itemId,
              req.endpoint,
              req.body)
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
        const response = await api.deleteItem(database, collectionId, itemId)
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
        database, collectionId, itemId, req.query, req.headers
      )

      if (response instanceof NotFoundError) {
        next(createError(404))
      } else if (response instanceof Error) {
        next(createError(500))
      } else {
        res.redirect(response.location)
      }
    } catch (error) {
      next(error)
    }
  })

  app.get('/collections/:collectionId/items/:itemId/assets/:assetKey',
    async (req, res, next) => {
      if (!req.app.locals['assetProxy'].isEnabled) {
        next(createError(404))
        return
      }

      try {
        const item = await api.getItem(
          database,
          req.params.collectionId,
          req.params.itemId,
          req.endpoint,
          req.query,
          req.headers,
        )

        if (item instanceof NotFoundError) {
          next(createError(404))
        } else {
          const presignedUrl = await req.app.locals['assetProxy'].getAssetPresignedUrl(
            item,
            req.params.assetKey
          )
          if (!presignedUrl) {
            next(createError(404))
          } else {
            res.redirect(presignedUrl)
          }
        }
      } catch (error) {
        next(error)
      }
    })

  app.get('/collections/:collectionId/assets/:assetKey', async (req, res, next) => {
    if (!req.app.locals['assetProxy'].isEnabled) {
      next(createError(404))
      return
    }

    try {
      const collection = await api.getCollection(
        database,
        req.params.collectionId,
        req.endpoint,
        req.query,
        req.headers,
      )

      if (collection instanceof NotFoundError) {
        next(createError(404))
      } else {
        const presignedUrl = await req.app.locals['assetProxy'].getAssetPresignedUrl(
          collection,
          req.params.assetKey
        )
        if (!presignedUrl) {
          next(createError(404))
        } else {
          res.redirect(presignedUrl)
        }
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    /** @type {ErrorRequestHandler} */ ((err, _req, res, _next) => {
      res.status(err.status || 500)

      res.type('application/json')

      switch (err.status) {
      case 400:
        res.json({ code: 'BadRequest', description: err.message })
        break
      case 403:
        res.json({ code: 'Forbidden', description: 'Forbidden' })
        break
      case 404:
        res.json({ code: 'NotFound', description: 'Not Found' })
        break
      default:
        logger.error(err)
        res.json({ code: 'InternalServerError', description: err.message })
        break
      }
    })
  )

  return app
}

export default { createApp }
