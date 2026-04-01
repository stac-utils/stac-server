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
  assets: Assets
  collection: string
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
  assets?: Assets
  item_assets?: {[key: string]: Asset}
}

export type StacRecord = StacItem | StacCollection

export interface Link {
  href: string
  rel: string
  type?: string
  title?: string
  method?: string
  headers?: {[key: string]: string | string[]}
  body?: { [key: string]: unknown}
}

export interface Assets {
  [key: string]: Asset
}

export interface Asset {
  href: string
  title?: string
  description?: string
  type?: string
  roles?: string[]
  alternate?: {[key: string]: unknown}
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
  bbox: BBox[]
}

export interface TemporalExtent {
  interval: [[string | null, string | null], ...[string | null, string | null][]]
}

export interface ItemProperties {
  datetime: string | null // ISO 8601 format required e.g. "2026-03-18T00:00:00Z"
  start_datetime?: string
  end_datetime?: string
  [key: string]: unknown // permit additional fields by user
}

// only used when truncating via sns or sqs
export interface DbAction {
  type: 'action'
  command: 'truncate'
  collection: string
}

export type StacServerMessage = StacRecord | DbAction

export interface DateRange {
  startDate: Date | undefined
  endDate: Date | undefined
}

export interface DbOperation {
  placeholder: string // to be replaced when typing database.js and ingest.js
}

export interface SearchParameters {
  index: string[]
  body: SearchParametersBody
  size: number
  track_total_hits: boolean
  from?: number
  _sourceExcludes: unknown
  _sourceIncludes: unknown
}

export interface SearchParametersBody {
  size: number
  aggs?: SearchParametersAggregations

}

export interface SearchParametersAggregations {
  grid_geohash_frequency?: {geohash_grid: GeoGridSetting}
  grid_geohex_frequency?: {geohex_grix: GeoGridSetting}
  grid_geotile_frequency? : {geotile_grid: GeoGridSetting}
  centroid_geohash_grid_frequency?: {geohash_grid: GeoGridSetting}
  centroid_geohex_grid_frequency? : {geohex_grid: GeoGridSetting}
  centroid_geotile_grid_frequency? : {geotile_grid: GeoGridSetting}
  geometry_geohash_grid_frequency? : {geohash_grid: GeomGridSetting}
  geometry_geotile_grid_frequency? : {geotile_grid: GeomGridSetting}

}

export interface GeoGridSetting {
  field: 'properties.proj:centroid'
  precision: number
}

export interface GeomGridSetting {
  field: 'geometry'
  precision: number
}
