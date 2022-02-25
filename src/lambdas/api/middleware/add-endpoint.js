// @ts-check

/**
 * @typedef {import('express').Request} Request
 * @typedef {import('express').Response} Response
 * @typedef {import('express').NextFunction} NextFunction
 */

/**
 * @param {Request} req
 * @returns {string}
 */
const determineEndpoint = (req) => {
  const xStacEndpoint = req.get('X-STAC-Endpoint')
  if (xStacEndpoint) return xStacEndpoint

  if (process.env['STAC_API_URL']) return process.env['STAC_API_URL']

  if (req.get('X-Forwarded-Proto') && req.get('X-Forwarded-Host')) {
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
const addEndpoint = (req, _res, next) => {
  req.endpoint = determineEndpoint(req)
  next()
}

module.exports = {
  addEndpoint
}
