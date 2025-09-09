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
  const stacEndpointHeader = req.get('x-stac-endpoint') || req.get('stac-endpoint')
  if (stacEndpointHeader) return stacEndpointHeader

  if (process.env['STAC_API_URL']) return process.env['STAC_API_URL']

  const rootPath = process.env['STAC_API_ROOTPATH'] || ''

  if (req.get('X-Forwarded-Proto') && req.get('X-Forwarded-Host')) {
    return `${req.get('X-Forwarded-Proto')}://${req.get('X-Forwarded-Host')}${rootPath}`
  }

  return req.event && req.event.requestContext && req.event.requestContext.stage
    ? `${req.get('X-Forwarded-Proto')}://${req.get('Host')}/${req.event.requestContext.stage}`
    : `${req.get('X-Forwarded-Proto')}://${req.get('Host')}${rootPath}`
}

/**
 * @param {Request} req
 * @param {Response} _res
 * @param {NextFunction} next
 * @returns {void}
 */
export default (req, _res, next) => {
  req.endpoint = determineEndpoint(req)
  next()
}
