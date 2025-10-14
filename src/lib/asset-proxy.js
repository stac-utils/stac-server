import { S3Client, GetObjectCommand, ListBucketsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import logger from './logger.js'

export const BucketOption = Object.freeze({
  NONE: 'NONE',
  ALL: 'ALL',
  ALL_BUCKETS_IN_ACCOUNT: 'ALL_BUCKETS_IN_ACCOUNT',
  LIST: 'LIST'
})

// Cached configuration
let proxyConfigCache = null

// Cached S3 clients by region to avoid creating new clients on each request
const s3ClientCache = new Map()

/**
 * Get or create an S3Client for a specific region
 * @param {string} region - AWS region
 * @returns {S3Client} Cached or new S3 client
 */
const getS3Client = (region) => {
  if (s3ClientCache.has(region)) {
    return s3ClientCache.get(region)
  }

  const client = new S3Client({ region })
  s3ClientCache.set(region, client)
  return client
}

/**
 * Fetch all bucket names in the AWS account
 * This is called once during configuration initialization if mode is ALL_BUCKETS_IN_ACCOUNT
 * @returns {Promise<Set<string>>} Set of bucket names
 */
const fetchAllBucketsInAccount = async () => {
  try {
    const region = process.env['AWS_REGION'] || 'us-west-2'
    const client = getS3Client(region)
    const command = new ListBucketsCommand({})
    const response = await client.send(command)

    const bucketNames = response.Buckets?.map((b) => b.Name)
      ?.filter((name) => typeof name === 'string') || []
    const buckets = new Set(bucketNames)
    logger.info(`Fetched ${buckets.size} buckets from AWS account for asset proxy`)
    return buckets
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Failed to fetch buckets from AWS account', { error: errorMessage })
    throw new Error(`Failed to fetch buckets for asset proxy: ${errorMessage}`)
  }
}

/**
 * Initialize asset proxy configuration.
 * The config is cached after first initialization. Subsequent calls return the cached value.
 * @returns {Promise<Object>} Configuration object
 */
export const initProxyConfig = async () => {
  if (proxyConfigCache) {
    return proxyConfigCache
  }

  const bucketOption = process.env['ASSET_PROXY_BUCKET_OPTION'] || BucketOption.NONE
  const bucketList = process.env['ASSET_PROXY_BUCKET_LIST'] || ''
  const urlExpiry = parseInt(process.env['ASSET_PROXY_URL_EXPIRY'] || '300', 10)

  switch (bucketOption) {
  case BucketOption.NONE:
    proxyConfigCache = {
      enabled: false,
      mode: BucketOption.NONE,
      buckets: new Set(),
      urlExpiry
    }
    break

  case BucketOption.ALL:
    proxyConfigCache = {
      enabled: true,
      mode: BucketOption.ALL,
      buckets: new Set(),
      urlExpiry
    }
    break

  case BucketOption.ALL_BUCKETS_IN_ACCOUNT: {
    const buckets = await fetchAllBucketsInAccount()
    proxyConfigCache = {
      enabled: true,
      mode: BucketOption.ALL_BUCKETS_IN_ACCOUNT,
      buckets,
      urlExpiry
    }
    break
  }

  case BucketOption.LIST: {
    const buckets = bucketList.split(',').map((b) => b.trim()).filter((b) => b)
    proxyConfigCache = {
      enabled: true,
      mode: BucketOption.LIST,
      buckets: new Set(buckets),
      urlExpiry
    }
    break
  }

  default: {
    const validOptions = Object.values(BucketOption).join(', ')
    throw new Error(
      `Invalid ASSET_PROXY_BUCKET_OPTION: ${bucketOption}. Must be one of: ${validOptions}`
    )
  }
  }

  logger.debug('Asset proxy configuration loaded', {
    mode: proxyConfigCache.mode,
    enabled: proxyConfigCache.enabled,
    bucketCount: proxyConfigCache.buckets.size,
    urlExpiry: proxyConfigCache.urlExpiry
  })

  return proxyConfigCache
}

/**
 * Get the cached proxy configuration synchronously
 * @returns {Object} Cached configuration object
 */
export const getCachedProxyConfig = () => {
  if (!proxyConfigCache) {
    throw new Error('Asset proxy config not initialized.')
  }
  return proxyConfigCache
}

/**
 * Parse S3 URL (URI or HTTPS) into components
 * Supports:
 * - s3://bucket/key
 * - https://bucket.s3.amazonaws.com/key
 * - https://bucket.s3.region.amazonaws.com/key
 * - https://s3.amazonaws.com/bucket/key
 * - https://s3.region.amazonaws.com/bucket/key
 *
 * @param {string} url - S3 URL to parse
 * @returns {Object|null} {bucket, key, region} or null if not a valid S3 URL
 */
export const parseS3Url = (url) => {
  // S3 URI format: s3://bucket/key
  if (url.startsWith('s3://')) {
    const withoutProtocol = url.substring(5)
    const firstSlash = withoutProtocol.indexOf('/')

    if (firstSlash === -1) {
      return null // No key provided
    }

    const bucket = withoutProtocol.substring(0, firstSlash)
    const key = withoutProtocol.substring(firstSlash + 1)

    if (!bucket || !key) {
      return null
    }

    return { bucket, key, region: null }
  }

  // HTTPS URL formats
  if (url.startsWith('https://')) {
    try {
      const urlObj = new URL(url)
      const hostname = urlObj.hostname
      const pathname = urlObj.pathname

      // Virtual-hosted style: bucket.s3.region.amazonaws.com or bucket.s3.amazonaws.com
      const virtualHostMatch = hostname.match(/^([^.]+)\.s3(?:\.([^.]+))?\.amazonaws\.com$/)
      if (virtualHostMatch) {
        const bucket = virtualHostMatch[1]
        const region = virtualHostMatch[2] || null
        const key = pathname.startsWith('/') ? pathname.substring(1) : pathname

        if (!key) {
          return null
        }

        return { bucket, key, region }
      }

      // Path style: s3.region.amazonaws.com/bucket/key,
      // s3-region.amazonaws.com/bucket/key, or s3.amazonaws.com/bucket/key
      const pathStyleMatch = hostname.match(/^s3(?:[.-]([^.]+))?\.amazonaws\.com$/)
      if (pathStyleMatch) {
        const region = pathStyleMatch[1] || null
        const pathParts = pathname.split('/').filter((p) => p)

        if (pathParts.length < 2) {
          return null // Need at least bucket and key
        }

        const bucket = pathParts[0]
        const key = pathParts.slice(1).join('/')

        return { bucket, key, region }
      }
    } catch (_error) {
      // Invalid URL
      return null
    }
  }

  return null
}

/**
 * Determine if a asset hrefs should be proxied
 * @param {string} bucket - asset S3 bucket
 * @param {Object} proxyConfig - Proxy configuration
 * @returns {boolean} True if should be proxied
 */
export const shouldProxyAssets = (bucket, proxyConfig) => {
  if (!proxyConfig.enabled) {
    return false
  }

  if (proxyConfig.mode === BucketOption.ALL) {
    return true
  }

  // For LIST and ALL_BUCKETS_IN_ACCOUNT modes
  return proxyConfig.buckets.has(bucket)
}

/**
 * Generate a pre-signed URL for S3 object access
 * Uses cached S3 clients per region for better performance.
 *
 * @param {string} bucket - S3 bucket name
 * @param {string} key - S3 object key
 * @param {string} region - AWS region
 * @param {number} expirySeconds - URL expiry time in seconds
 * @returns {Promise<string>} Pre-signed URL
 */
export const generatePresignedUrl = async (bucket, key, region, expirySeconds) => {
  const client = getS3Client(region)

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    RequestPayer: 'requester'
  })

  const presignedUrl = await getSignedUrl(client, command, {
    expiresIn: expirySeconds
  })

  logger.debug('Generated pre-signed URL for asset', {
    bucket,
    key,
    region,
    expirySeconds,
  })

  return presignedUrl
}

/**
 * Proxy asset hrefs and add original href as alternate
 * @param {Object} assets - Assets object
 * @param {string} endpoint - API endpoint base URL
 * @param {string} collectionId - Collection ID
 * @param {string|null} itemId - Item ID (null for collection assets)
 * @param {Object} proxyConfig - Proxy configuration
 * @returns {Object} {assets: Proxied assets object, wasProxied: boolean}
 */
export const proxyAssets = (assets, endpoint, collectionId, itemId, proxyConfig) => {
  const ProxiedAssets = {}
  let wasProxied = false

  for (const [assetKey, asset] of Object.entries(assets)) {
    if (!asset || !asset.href) {
      ProxiedAssets[assetKey] = asset
      // eslint-disable-next-line no-continue
      continue
    }

    const s3Info = parseS3Url(asset.href)
    if (!s3Info || !shouldProxyAssets(s3Info.bucket, proxyConfig)) {
      ProxiedAssets[assetKey] = asset
      // eslint-disable-next-line no-continue
      continue
    }

    wasProxied = true

    const proxyHref = itemId
      ? `${endpoint}/collections/${collectionId}/items/${itemId}/assets/${assetKey}`
      : `${endpoint}/collections/${collectionId}/assets/${assetKey}`

    ProxiedAssets[assetKey] = {
      ...asset,
      href: proxyHref,
      alternate: {
        ...(asset.alternate || {}),
        s3: {
          href: asset.href
        }
      }
    }
  }

  return { assets: ProxiedAssets, wasProxied }
}

/**
 * Determine S3 region STAC Storage Extension, if it exists
 * @param {Object} asset - Asset object
 * @param {Object} itemOrCollection - Item or Collection object
 * @returns {string} AWS region
 */
export const determineS3Region = (asset, itemOrCollection) => {
  // Storage Extension v1
  const v1Region = asset['storage:region'] || itemOrCollection.properties?.['storage:region']
  if (v1Region) {
    return v1Region
  }

  // Storage Extension v2
  const storageSchemes = itemOrCollection.properties?.['storage:schemes']
    || itemOrCollection['storage:schemes']
  const v2Region = storageSchemes?.[asset['storage:refs']]?.region
  if (v2Region) {
    return v2Region
  }

  // Default to environment or us-west-2
  return process.env['AWS_REGION'] || 'us-west-2'
}

export default {
  initProxyConfig,
  getCachedProxyConfig,
  parseS3Url,
  shouldProxyAssets,
  generatePresignedUrl,
  proxyAssets,
  determineS3Region,
}
