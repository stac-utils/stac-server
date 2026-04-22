import { ApiResponse } from '@opensearch-project/opensearch'
import type { Geometry, BBox, GeoJSON } from 'geojson'

//
// ----- STAC -----------------------------------------------------
//

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

export type StacItemResponse = Omit<StacItem, 'id' | 'collection'> & {
  id?: string
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
  queryables?: Queryables
  aggregations?: Aggregation[]
  summaries?: {[key: string]: string[] | number[]}
  links: Link[]
  assets?: Assets
  item_assets?: {[key: string]: Asset}
}

export interface StacCatalog {
  stac_version: string
  type: string
  id: string
  title: string
  description: string
  conformsTo: string[]
  links: Link[]
}

export type StacRecord = StacItem | StacCollection

export interface Link {
  href: string
  rel: string
  type?: string
  title?: string
  method?: string
  merge?: boolean
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
  updated?: string
  [key: string]: unknown // permit additional fields by user
}

export type StacServerMessage = StacRecord | DbAction

export interface Queryables {
  $schema: string
  $id: string
  type: string
  title: string
  description?: string
  additionalProperties: boolean
  properties: {
    [x: string]: QueryableProperty
  }
}

export interface QueryableProperty {
  description: string
  $ref: string
}

export interface Aggregation {
  name: string
  data_type: string
  value?: string | number | null
  overflow?: number
  buckets?: AggregationBucket[]
  frequency_distribution_data_type?: string
}

export interface AggregationBucket {
  key: string | number | undefined
  data_type: string
  frequency: number | undefined
  to?: number
  from?: number
}

export interface Aggregations {
  aggregations: Aggregation[]
  links: Link[]
}

//
// ---------------------------------------------------------------
//
//
// ── CQL2 / Filter ──────────────────────────────────────────────
//

export type Cql2Value =
  string |
  number |
  boolean |
  { property?: string, timestamp?: string, bbox?: BBox } |
  Geometry | Cql2Filter

export interface Cql2Filter {
  op: string
  args: Cql2Value[]
}

//
// ---------------------------------------------------------------
//
//
// ── OpenSearch query building blocks ──────────────────────────
//

export interface OpenSearchFilterQuery {
  term?: Record<string, unknown>
  terms?: Record<string, Array<string | boolean | number>>
  prefix?: Record<string, unknown>
  wildcard?: Record<string, unknown>
  range?: Record<string, Record<string, string | number>>
  geo_shape?: Record<string, unknown>
  exists?: Record<string, unknown>
  match_all?: Record<string, never>
  bool?: {
    filter?: OpenSearchFilterQuery | OpenSearchFilterQuery[]
    should?: OpenSearchFilterQuery[]
    must_not?: OpenSearchFilterQuery | OpenSearchFilterQuery[]
    minimum_should_match?: number
  }
}

export interface RangeQuery {
  range: {
    [key: string]: {
      gt?: string | number
      lt?: string | number
      gte?: string | number
      lte?: string | number
    }
  }
}

export interface DateTimeRange {
  gte?: string
  lte?: string
}

export interface DateQuery extends OpenSearchFilterQuery {
  range?: { 'properties.datetime': DateTimeRange } & Record<string, Record<string, string | number>>
  term?: { 'properties.datetime': string } & Record<string, unknown>
}

export interface OpenSearchBody {
  query: OpenSearchFilterQuery
  sort?: SortParameters
  search_after?: string[]
  size?: number
  aggs?: Record<string, unknown>
}

export interface SortRule {
  [field: string]: { order: string }
}

export type SortParameters = SortRule[]

//
// ---------------------------------------------------------------
//
//
// ── Query parameters ───────────────────────────────────────────
//

export interface QueryOperators {
  eq?: string | number | boolean
  neq?: string | number | boolean
  lt?: number
  lte?: number
  gt?: number
  gte?: number
  in?: Array<string | number | boolean>
  startsWith?: string
  endsWith?: string
  contains?: string
}

export interface QueryParameters {
  id?: string
  ids?: string[]
  collections?: string[]
  intersects?: Geometry
  datetime?: string
  sortby?: { field: string, direction: 'asc' | 'desc' }[]
  next?: string
  fields?: {
    include?: string[]
    exclude?: string[]
  }
  query?: Record<string, QueryOperators>
  filter?: Cql2Filter
}

// only used when truncating via sns or sqs
export interface DbAction {
  type: 'action'
  command: 'truncate'
  collection: string
}
//
// ---------------------------------------------------------------
//
//
// ── Search ─────────────────────────────────────────────────────

export interface FieldsFilter {
  _sourceIncludes: string[]
  _sourceExcludes: string[]
}

export interface DbQueryParameters {
  index?: string | string[]
  body?: OpenSearchBody
  size?: number
  collections?: string[]
  id?: string
  track_total_hits?: boolean
  from?: number
  _sourceExcludes?: string[]
  _sourceIncludes?: string[]
  ignore_unavailable?: boolean
  allow_no_indices?: boolean
}

export interface SearchParameters extends DbQueryParameters {
  index: string
  body: OpenSearchBody
  size: number
  track_total_hits: boolean
}

export interface SearchResponse {
  results: StacItem[]
  numberMatched: number
  numberReturned: number
  lastItemSort: string | null
}

//
// ---------------------------------------------------------------
//
//
// ── Transaction Request Bodies ─────────────────────────────────

/**
 * PATCH /collections/:collectionId/items/:itemId
 * Partial update — only fields to change, id/collection optional but must match URL if present
 */
export interface PartialItemUpdate {
  id?: string
  collection?: string
  geometry?: Geometry | null
  bbox?: BBox
  properties?: ItemProperties
  assets?: Assets
  links?: Link[]
  [key: string]: unknown
}

/**
 * PUT /collections/:collectionId/items/:itemId
 */
export type FullItemUpdate = StacItem

/**
 * POST /collections/:collectionId/items
 * Can be a single item or a feature collection of items
 */
export interface ItemFeatureCollection {
  type: 'FeatureCollection'
  features: StacItem[]
}

export type CreateItemBody = StacItem | ItemFeatureCollection

//
//
// ---------- API -----------------------------------
//

export interface APIParameters {
  limit?: string
  aggregations?: string | string[]
  page?: string
  ids?: string | string[]
  collections?: string | string[] // user supplied
  _collections?: string | string[] // internally applied authorized collections filter
  datetime?: string
  fields?: APIFields | string // string for GET request
  bbox?: BBox | string | undefined
  sortby?: string | string[] // 'asc' or 'desc'
  intersects?: string | GeoJSON
  query?: string | QueryOperators // This might be wrong
  filter?: Cql2Filter // external, user supplied
  _filter?: Cql2Filter // only internally applied for auth filtering
  next?: string
  'filter-lang'?: string
  'filter-crs'?: string
}

export interface APIFields {
  exclude?: string[]
  include?: string[]
}

export interface StacApiResult {
  type?: string
  collections?: StacCollection[]
  numberMatched?: number
  numberReturned?: number
  features?: StacItem[]
  links: Link[]
}

//
//
// ---------------- Backend ---------------------------
//
//

export interface Backend {
  healthCheck(): Promise<ApiResponse>
  search(
    parameters: DbQueryParameters,
    limit: number | undefined,
    page: number | undefined
  ): Promise<SearchResponse>
  aggregate(
    aggregations: string[],
    parameters: QueryParameters,
    geohashPrecision: number,
    geohexPrecision: number,
    geotilePrecision: number,
    centroidGeohashGridPrecision: number,
    centroidGeohexGridPrecision: number,
    centroidGeotileGridPrecision: number,
    geometryGeohashGridPrecision: number,
    geometryGeotileGridPrecision: number,
  ): Promise<ApiResponse>
  getCollection(collectionId: string): Promise<StacCollection | Error>
  getCollections(page: number, limit: number): Promise<StacCollection[] | Error>
  indexItem(item: StacItem): Promise<ApiResponse | Error>
  updateItem(item: StacItem): Promise<ApiResponse<Record<string, unknown>, unknown> |
    Error>
  partialUpdateItem(
    collectionId: string,
    itemId: string,
    updateFields: PartialItemUpdate
  ): Promise<ApiResponse | undefined>
  deleteItem(collectionId: string, itemId: string): Promise<ApiResponse>
  indexCollection(collection: StacCollection): Promise<Array<ApiResponse | void>>
}
