import { z } from 'zod'
import { GeoJSONGeometrySchema } from 'zod-geojson'

const Link = z.object({
  href: z.url(),
  rel: z.string(),
  type: z.string().optional(),
  title: z.string().optional(),
  method: z.enum(['GET', 'POST']).optional(),
  headers: z.looseObject({}).optional(),
  body: z.looseObject({}).optional(),
  merge: z.boolean().default(false)
})

const PartialItemRequest = z.object({
  stac_version: z.string(),
  stac_extensions: z.array(z.union([z.url(), z.string()])).optional(),
  id: z.string(),
  bbox: z.array(z.number()),
  geometry: GeoJSONGeometrySchema,
  type: z.literal('Feature'),
  properties: z.looseObject({ datetime: z.iso.datetime() }),
  links: z.array(Link).optional(),
  assets: z.looseObject({}).optional()
})

const PartialItemCollectionRequest = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(PartialItemRequest),
  links: z.array(Link).optional()
})

export const TransactionPostRequest = z.union([
  PartialItemRequest,
  PartialItemCollectionRequest
])

export const SearchCollectionItemsPostRequest = z.object({
  bbox: z.array(z.number()).min(4).max(6).optional(),
  datetime: z.iso.datetime().optional(),
  intersects: GeoJSONGeometrySchema.optional(),
  collections: z.array(z.string()).optional(),
  ids: z.array(z.string()).optional(),
  limit: z.number().default(10),
})
