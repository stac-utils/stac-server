import { GetObjectCommand, ListBucketsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3 } from './aws-clients.js'
import logger from './logger.js'
import { NotFoundError, ValidationError, ForbiddenError } from './errors.js'

const VIRTUAL_HOST_PATTERN = /^([^.]+)\.s3(?:\.([^.]+))?\.amazonaws\.com$/
const PATH_STYLE_PATTERN = /^s3(?:[.-]([^.]+))?\.amazonaws\.com$/

const s3ClientCache = new Map()
let assetProxyBucketsCache = null

const getBucketOption = () => process.env['ASSET_PROXY_BUCKET_OPTION'] || 'NONE'
const getBucketList = () => process.env['ASSET_PROXY_BUCKET_LIST']
const getUrlExpiry = () => parseInt(process.env['ASSET_PROXY_URL_EXPIRY'] || '300', 10)

export const BucketOption = Object.freeze({
  NONE: 'NONE',
  ALL: 'ALL',
  ALL_BUCKETS_IN_ACCOUNT: 'ALL_BUCKETS_IN_ACCOUNT',
  LIST: 'LIST'
})

/**
 * Get or create an S3 client for a specific region
 * @param {string} region - AWS region
 * @returns {Object} Cached or new S3 client
 */
const getS3Client = (region) => {
  if (s3ClientCache.has(region)) {
    return s3ClientCache.get(region)
  }

  const client = s3({ region })
  s3ClientCache.set(region, client)
  return client
}

/**
 * Cache bucket names for asset proxying based on configuration.
 * @returns {Promise<void>}
 */
export const getAssetProxyBuckets = async () => {
  const bucketOption = getBucketOption()
  const bucketList = getBucketList()

  switch (bucketOption) {
  case BucketOption.LIST:
    if (bucketList) {
      const bucketNames = bucketList.split(',').map((b) => b.trim()).filter((b) => b)
      assetProxyBucketsCache = new Set(bucketNames)
      logger.info(
        `Parsed ${assetProxyBucketsCache.size} buckets from ASSET_PROXY_BUCKET_LIST for asset proxy`
      )
    } else {
      throw new Error('ASSET_PROXY_BUCKET_LIST must be set when ASSET_PROXY_BUCKET_OPTION is LIST')
    }
    break

  case BucketOption.ALL_BUCKETS_IN_ACCOUNT:
    try {
      const region = process.env['AWS_REGION'] || 'us-west-2'
      const client = getS3Client(region)
      const command = new ListBucketsCommand({})
      const response = await client.send(command)
      const bucketNames = response.Buckets?.map((b) => b.Name)
        ?.filter((name) => typeof name === 'string') || []
      assetProxyBucketsCache = new Set(bucketNames)
      logger.info(`Fetched ${assetProxyBucketsCache.size} buckets from AWS account for asset proxy`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to fetch buckets for asset proxy: ${message}`)
    }
    break

  default:
    break
  }
}

/**
 * Parse S3 URL (URI or HTTPS) into components
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
      const virtualHostMatch = hostname.match(VIRTUAL_HOST_PATTERN)
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
      const pathStyleMatch = hostname.match(PATH_STYLE_PATTERN)
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
 * Determine if asset proxying is enabled
 * @returns {boolean} True if enabled
 */
export const isAssetProxyEnabled = () => {
  if (getBucketOption() === BucketOption.NONE) {
    return false
  }
  return true
}

/**
 * Determine if a bucket's assets should be proxied
 * @param {string} bucket - S3 bucket
 * @returns {boolean} True if assets should be proxied
 */
export const shouldProxyAssets = (bucket) => {
  if (getBucketOption() === BucketOption.ALL || assetProxyBucketsCache?.has(bucket)) {
    return true
  }
  return false
}

/**
 * Proxy asset hrefs and add original href as alternate
 * @param {Object} assets - Assets object
 * @param {string} endpoint - API endpoint base URL
 * @param {string} collectionId - Collection ID
 * @param {string|null} itemId - Item ID (null for collection assets)
 * @returns {Object} {assets: Proxied assets object, wasProxied: boolean}
 */
export const proxyAssets = (assets, endpoint, collectionId, itemId) => {
  const ProxiedAssets = {}
  let wasProxied = false

  for (const [assetKey, asset] of Object.entries(assets)) {
    if (!asset?.href) {
      ProxiedAssets[assetKey] = asset
      // eslint-disable-next-line no-continue
      continue
    }

    const s3Info = parseS3Url(asset.href)
    if (!s3Info || !(shouldProxyAssets(s3Info.bucket))) {
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
 * Determine S3 region from STAC Storage Extension
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

/**
 * Create a pre-signed URL for S3 object access
 * @param {string} bucket - S3 bucket name
 * @param {string} key - S3 object key
 * @param {string} region - AWS region
 * @returns {Promise<string>} Pre-signed URL
 */
export const createPresignedS3Url = async (bucket, key, region) => {
  const client = getS3Client(region)
  const urlExpiry = getUrlExpiry()

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    RequestPayer: 'requester'
  })

  const presignedUrl = await getSignedUrl(client, command, {
    expiresIn: urlExpiry
  })

  logger.debug('Generated pre-signed URL for asset', {
    bucket,
    key,
    region,
    urlExpiry,
  })

  return presignedUrl
}

/**
 * Generate a presigned URL for an asset
 * @param {Object} itemOrCollection - STAC Item or Collection
 * @param {string} assetKey - Asset key to generate presigned URL for
 * @returns {Promise<string|Error>} Pre-signed URL or Error
 */
export const getAssetPresignedUrl = async (itemOrCollection, assetKey) => {
  if (!isAssetProxyEnabled()) {
    return new ForbiddenError()
  }

  const asset = itemOrCollection.assets?.[assetKey] || null
  if (!asset) {
    return new NotFoundError()
  }

  const alternateS3Href = asset.alternate?.s3?.href || null
  if (!alternateS3Href) {
    return new NotFoundError()
  }

  const s3Info = parseS3Url(alternateS3Href)
  if (!s3Info) {
    return new ValidationError('Asset S3 href is invalid')
  }

  if (!shouldProxyAssets(s3Info.bucket)) {
    return new ForbiddenError()
  }

  const region = s3Info.region || determineS3Region(asset, itemOrCollection)
  const presignedUrl = await createPresignedS3Url(s3Info.bucket, s3Info.key, region)

  return presignedUrl
}

export default {
  getAssetProxyBuckets,
  parseS3Url,
  isAssetProxyEnabled,
  shouldProxyAssets,
  createPresignedS3Url,
  proxyAssets,
  determineS3Region,
}
