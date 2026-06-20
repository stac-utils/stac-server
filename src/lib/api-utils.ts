import { DateTime } from 'luxon'
import { Geometry } from 'geojson'
import { IncomingHttpHeaders } from 'http'
import { ValidationError } from './errors.js'
import { bboxToPolygon } from './geo-utils.js'
import { APIFields, APIParameters, Cql2Filter, QueryOperators } from './types.js'

export const DEFAULT_LIMIT = 10

export const extractLimit = function (params: APIParameters): number {
  const { limit: limitStr } = params

  if (limitStr !== undefined) {
    let limit
    try {
      limit = parseInt(limitStr)
    } catch (_) {
      throw new ValidationError('Invalid limit value')
    }

    if (Number.isNaN(limit) || limit <= 0) {
      throw new ValidationError(
        'Invalid limit value, must be a positive number'
      )
    }

    let itemsMaxLimit = Number(process.env['ITEMS_MAX_LIMIT'])
    if (Number.isNaN(itemsMaxLimit) || itemsMaxLimit <= 0) {
      itemsMaxLimit = Number.MAX_SAFE_INTEGER
    }
    limit = Math.min(
      itemsMaxLimit,
      limit || Number.MAX_SAFE_INTEGER,
      10000
    )

    return limit
  }
  return DEFAULT_LIMIT
}

type PrecisionField =
  | 'grid_geohash_frequency_precision'
  | 'grid_geohex_frequency_precision'
  | 'grid_geotile_frequency_precision'
  | 'centroid_geohash_grid_frequency_precision'
  | 'centroid_geohex_grid_frequency_precision'
  | 'centroid_geotile_grid_frequency_precision'
  | 'geometry_geohash_grid_frequency_precision'
  | 'geometry_geotile_grid_frequency_precision'

export const extractPrecision = function (
  params: APIParameters,
  name: PrecisionField,
  min: number,
  max: number
): number {
  const precisionStr = params[name]

  if (precisionStr !== undefined) {
    let precision
    try {
      precision = parseInt(precisionStr)
    } catch (_) {
      throw new ValidationError(`Invalid precision value for ${name}`)
    }

    if (Number.isNaN(precision) || precision < min || precision > max) {
      throw new ValidationError(
        `Invalid precision value for ${name}, must be a number between ${min} and ${max} inclusive`
      )
    }
    return precision
  }

  return min
}

export const extractAggregations = function (params: APIParameters): string[] {
  let aggs
  const { aggregations } = params
  if (aggregations) {
    if (typeof aggregations === 'string') {
      try {
        aggs = JSON.parse(aggregations)
      } catch (_) {
        aggs = aggregations.split(',')
      }
    } else {
      aggs = aggregations.slice()
    }
  }
  return aggs || []
}

export const extractPage = function (params: APIParameters): number | undefined {
  const { page: pageStr } = params

  if (pageStr !== undefined) {
    let page: number
    try {
      page = parseInt(pageStr)
    } catch (_) {
      throw new ValidationError('Invalid page value')
    }

    if (Number.isNaN(page) || page <= 0) {
      throw new ValidationError(
        'Invalid page value, must be a number greater than 1'
      )
    }
    return page
  }
  return undefined
}

// eslint-disable-next-line max-len
const RFC3339_REGEX = /^(\d\d\d\d)\-(\d\d)\-(\d\d)T(\d\d):(\d\d):(\d\d)([.]\d+)?(Z|([-+])(\d\d):(\d\d))$/

const rfc3339ToDateTime = function (s: string): DateTime {
  if (!RFC3339_REGEX.test(s)) {
    throw new ValidationError('datetime value is invalid, does not match RFC3339 format')
  }
  const dt = DateTime.fromISO(s)
  if (dt.isValid) {
    return dt
  }
  throw new ValidationError(
    `datetime value is invalid, ${dt.invalidReason} ${dt.invalidExplanation}'`
  )
}

const validateStartAndEndDatetimes = function (
  startDateTime: DateTime | undefined,
  endDateTime: DateTime | undefined
) {
  if (startDateTime && endDateTime && endDateTime < startDateTime) {
    throw new ValidationError(
      'datetime value is invalid, start datetime must be before end datetime with interval'
    )
  }
}

export const extractDatetime = function (params: APIParameters): string | undefined {
  const { datetime } = params

  if (datetime) {
    const datetimeUpperCase = datetime.toUpperCase()
    const [start, end, ...rest] = datetimeUpperCase.split('/')
    if (rest.length) {
      throw new ValidationError(
        'datetime value is invalid, too many forward slashes for an interval'
      )
    } else if ((!start && !end)
        || (start === '..' && end === '..')
        || (!start && end === '..')
        || (start === '..' && !end)
    ) {
      throw new ValidationError(
        'datetime value is invalid, at least one end of the interval must be closed'
      )
    } else {
      const startDateTime = (start && start !== '..') ? rfc3339ToDateTime(start) : undefined
      const endDateTime = (end && end !== '..') ? rfc3339ToDateTime(end) : undefined
      validateStartAndEndDatetimes(startDateTime, endDateTime)
    }
    return datetimeUpperCase
  }
  return undefined
}

/**
 * ensure that fields necessary for creating links i.e. 'collection' and 'id'
 * are not excluded from query, and exclude any other fields picked
 * by user to exclude.  These fields will be removed later to ensure
 * results match user expectations
 */
export const createQueryFields = function (fields: APIFields): APIFields {
  const { exclude } = fields
  if (exclude) {
    const filteredExclude = exclude.filter(
      (field) => field !== 'id' && field !== 'collection'
    )
    if (filteredExclude.length === 0) {
      const { exclude: _removed, ...rest } = fields
      return rest
    }

    return {
      ...fields,
      exclude: filteredExclude
    }
  }
  return fields
}

export const extractFields = function (params: APIParameters): APIFields {
  let fieldRules: { include?: string[], exclude?: string[] } = {}
  const { fields } = params
  if (fields) {
    if (typeof fields === 'string') {
      // GET request - different syntax
      const _fields = fields.split(',')
      const include: string[] = []
      _fields.forEach((rule) => {
        if (rule[0] !== '-') {
          if (rule[0] === '+') {
            include.push(rule.slice(1))
          } else {
            include.push(rule)
          }
        }
      })
      if (include.length) {
        fieldRules.include = include
      }

      const exclude: string[] = []
      _fields.forEach((rule) => {
        if (rule[0] === '-') {
          exclude.push(rule.slice(1))
        }
      })
      if (exclude.length) {
        fieldRules.exclude = exclude
      }
    } else {
      // POST request - JSON
      fieldRules = fields
    }
  } else if (params.hasOwnProperty('fields')) {
    // fields was provided as an empty object
    if (params.fields === null) {
      throw new ValidationError(
        '`fields` parameter must be an object, optionally with one or '
          + 'both of the keys "include" and "exclude"'
      )
    }
  }
  return fieldRules
}

export const extractBbox = function (
  params: APIParameters,
  httpMethod = 'GET'
): Geometry | undefined {
  const { bbox } = params
  return bboxToPolygon(bbox, httpMethod === 'GET')
}

export const extractIntersects = function (params: APIParameters): Geometry | undefined {
  let intersectsGeometry
  const { intersects } = params
  if (intersects) {
    let geojson
    // if we receive a string, try to parse as GeoJSON, otherwise assume it is GeoJSON
    if (typeof intersects === 'string') {
      try {
        geojson = JSON.parse(intersects)
      } catch (_) {
        throw new ValidationError('Invalid GeoJSON geometry')
      }
    } else {
      geojson = { ...intersects }
    }

    if (geojson.type === 'FeatureCollection' || geojson.type === 'Feature') {
      throw new Error(
        'Expected GeoJSON geometry, not Feature or FeatureCollection'
      )
    }
    intersectsGeometry = geojson
  }
  return intersectsGeometry
}

export const extractStacQuery = function (
  params: APIParameters
): Record<string, QueryOperators> | undefined {
  let stacQuery
  const { query } = params
  if (query) {
    if (typeof query === 'string') {
      const parsed = JSON.parse(query)
      stacQuery = parsed
    } else {
      stacQuery = { ...query }
    }
  }
  return stacQuery
}

/**
 * extract the user supplied CQL2 filter
 */
export const extractCql2Filter = function (params: APIParameters): Cql2Filter {
  let filterObj
  const { 'filter-lang': filterLang, 'filter-crs': filterCrs, filter } = params

  if (filterLang && filterLang !== 'cql2-json') {
    throw new ValidationError(
      `filter-lang must be "cql2-json". Supplied value: ${filterLang}`
    )
  }

  if (filterCrs && filterCrs !== 'http://www.opengis.net/def/crs/OGC/1.3/CRS84') {
    throw new ValidationError(
      `filter-crs must be "http://www.opengis.net/def/crs/OGC/1.3/CRS84". Supplied value: ${filterCrs}`
    )
  }

  if (filter) {
    if (typeof filter === 'string') {
      filterObj = JSON.parse(filter)
    } else {
      filterObj = { ...filter }
    }
  }
  return filterObj
}

/**
 * extract the internal-only CQL2 '_filter' that can be used for access control at the server side
 */
export const extractRestrictionCql2Filter = function (
  params: APIParameters,
  headers: IncomingHttpHeaders
): Cql2Filter | undefined {
  if (process.env['ENABLE_FILTER_AUTHX'] !== 'true') {
    return undefined
  }

  const authxHeader = headers['stac-filter-authx']

  const resolvedHeader = Array.isArray(authxHeader) ? authxHeader[0] : authxHeader
  const filter = resolvedHeader || params._filter

  if (filter) {
    if (typeof filter === 'string') {
      return JSON.parse(filter)
    }
    return { ...filter }
  }
  return undefined
}

/**
 * combine the user provided CQL2 filter and the auth CQL2 filter
 */
export const concatenateCql2Filters = function (
  specifiedFilter: Cql2Filter | undefined,
  restrictionFilter: Cql2Filter | undefined
): Cql2Filter | undefined {
  // an "and" op must have at least two args, so don't wrap if only one
  // of the filters is defined

  if (!specifiedFilter && !restrictionFilter) {
    return undefined
  }

  if (specifiedFilter && !restrictionFilter) {
    return specifiedFilter
  }

  if (!specifiedFilter && restrictionFilter) {
    return restrictionFilter
  }

  return {
    op: 'and',
    args: [
      specifiedFilter as Cql2Filter,
      restrictionFilter as Cql2Filter
    ]
  }
}

/**
 * Parse a string or array of IDs into an array of strings or undefined.
 */
export const parseIds = function (
  ids: string | string[] | undefined
): string[] | undefined {
  let idsRules
  if (ids) {
    if (typeof ids === 'string') {
      try {
        idsRules = JSON.parse(ids)
      } catch (_) {
        idsRules = ids.split(',')
      }
    } else {
      idsRules = ids.slice()
    }
  }
  return idsRules
}

export const extractIds = function (params: APIParameters): string[] | undefined {
  return parseIds(params.ids)
}

export const extractAllowedCollectionIds = function (
  params: APIParameters,
  headers: IncomingHttpHeaders
): string[] | undefined {
  if (process.env['ENABLE_COLLECTIONS_AUTHX'] !== 'true') {
    return undefined
  }

  const authxHeader = headers['stac-collections-authx']

  if (authxHeader) {
    return parseIds(authxHeader)
  }

  if (params._collections) {
    return parseIds(params._collections)
  }

  return []
}

export const extractCollectionIds = function (params: APIParameters): string[] | undefined {
  return parseIds(params.collections)
}

export const filterAllowedCollectionIds = function (
  allowedCollectionIds: string[] | undefined,
  specifiedCollectionIds: string[] | undefined
): string[] | undefined {
  return (
    Array.isArray(allowedCollectionIds) && !allowedCollectionIds.includes('*')
  ) ? allowedCollectionIds.filter(
      (x) => !specifiedCollectionIds || specifiedCollectionIds.includes(x)
    ) : specifiedCollectionIds
}

export const isCollectionIdAllowed = function (
  allowedCollectionIds: string[] | undefined,
  collectionId: string
): boolean {
  return !Array.isArray(allowedCollectionIds)
          || allowedCollectionIds.includes(collectionId)
          || allowedCollectionIds.includes('*')
}

export const extractSortby = function (params: APIParameters):
string[] | { field: string; direction: string; }[] | undefined {
  let sortbyRules
  const { sortby } = params
  if (sortby) {
    if (typeof sortby === 'string') {
      // GET request - different syntax
      const sortbys = sortby.split(',')

      sortbyRules = sortbys.map((sortbyRule) => {
        if (sortbyRule[0] === '-') {
          return { field: sortbyRule.slice(1), direction: 'desc' }
        }
        if (sortbyRule[0] === '+') {
          return { field: sortbyRule.slice(1), direction: 'asc' }
        }
        return { field: sortbyRule, direction: 'asc' }
      })
    } else {
      // POST request
      sortbyRules = sortby.slice()
    }
  }
  return sortbyRules
}
