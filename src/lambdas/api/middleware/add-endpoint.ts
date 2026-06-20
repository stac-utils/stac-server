import { Request, Response, NextFunction } from 'express'

const determineEndpoint = (req: Request): string => {
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

export default (req: Request, _res: Response, next: NextFunction) => {
  req.endpoint = determineEndpoint(req)
  next()
}
