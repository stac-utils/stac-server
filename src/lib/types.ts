import type { Geometry, BBox } from 'geojson'

export interface StacItem {
  type: 'Feature'
  stac_version: string
  stac_extensions?: string[]
  id: string
  geometry: Geometry| null
  bbox?: BBox | string // only required if geometry is not null
  properties: ItemProperties
  links: Link[]
  assets: {[key: string]: ItemAsset}
  collection?: string
}

export interface StacCollection {
  type: 'Collection'
  stac_version: string
  stac_extensions?: string[]
  id: string
  title?: string
  description: string
  keywords?: string[]
  license: string
  providers?: Provider[]
  extent: Extent
  summaries?: {[key: string]: string[] | number[]}
  links: Link[]
  assets?: {[key: string]: Asset}
  item_assets?: {[key: string]: ItemAsset}

}

export interface Link {
  href: string
  rel: string
  type?: string
  title?: string
  method?: string
  headers?: {[key: string]: string | string[]}
  body?: { [key: string]: unknown}
}

export interface ItemAsset {
  title: string
  description: string
  type: string
  roles: string[]
  [key: string]: unknown // permit additional fields by user
}

export interface Asset {
  href: string
  title?: string
  description?: string
  type?: string
  roles?: string[]
  [key: string]: unknown // permit additional fields by user
}

export interface Provider {
  name: string
  description?: string
  roles?: Array<'licensor' | 'producer' | 'processor' | 'host'>
  url?: string
  [key: string]: unknown
}

export interface Extent {
  spatial: SpatialExtent
  temporal: TemporalExtent
}

export interface SpatialExtent {
  bbox: BBox
}

export interface TemporalExtent {
  interval: Array<[string | null, string | null]>
}

export interface ItemProperties {
  datetime: string | null // ISO 8601 format required e.g. "2026-03-18T00:00:00Z"
  [key: string]: unknown // permit additional fields by user
}
