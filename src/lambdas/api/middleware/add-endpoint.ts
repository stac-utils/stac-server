import { Request, Response, NextFunction } from 'express'

const determineEndpoint = (req: Request): string => {
  const stacEndpointHeader = req.get('x-stac-endpoint') || req.get('stac-endpoint')
  if (stacEndpointHeader) return stacEndpointHeader

  if (process.env['STAC_API_URL']) return process.env['STAC_API_URL']

  const rootPath = process.env['STAC_API_ROOTPATH'] || ''

  // API Gateway (REST) does not set the X-Forwarded-* headers by default, so
  // fall back to Express's view of the request rather than interpolating
  // `undefined` into the href — which produced `undefined://...` links (#917).
  const proto = req.get('X-Forwarded-Proto') || req.protocol || 'https'
  const forwardedHost = req.get('X-Forwarded-Host')
  const host = forwardedHost || req.get('Host') || 'localhost'

  if (!forwardedHost && req.event?.requestContext?.stage) {
    return `${proto}://${host}/${req.event.requestContext.stage}`
  }
  return `${proto}://${host}${rootPath}`
}

export default (req: Request, _res: Response, next: NextFunction) => {
  req.endpoint = determineEndpoint(req)
  next()
}
