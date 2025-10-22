import { GetObjectCommand, ListBucketsCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3 } from './aws-clients.js'
import logger from './logger.js'
import { NotFoundError, ValidationError, ForbiddenError } from './errors.js'

const VIRTUAL_HOST_PATTERN = /^([^.]+)\.s3(?:\.([^.]+))?\.amazonaws\.com$/
const PATH_STYLE_PATTERN = /^s3(?:[.-]([^.]+))?\.amazonaws\.com$/

const s3Client = s3()

export const ALTERNATE_ASSETS_EXTENSION = 'https://stac-extensions.github.io/alternate-assets/v1.2.0/schema.json'

export const BucketOption = Object.freeze({
  NONE: 'NONE',
  ALL: 'ALL',
  ALL_BUCKETS_IN_ACCOUNT: 'ALL_BUCKETS_IN_ACCOUNT',
  LIST: 'LIST'
})

/**
 * @param {string} url - S3 URL to parse
 * @returns {Object|null} {bucket, key, region} or null if not a valid S3 URL
 */
const parseS3Url = (url) => {
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
 * @param {Object} asset - Asset object
 * @param {Object} itemOrCollection - Item or Collection object
 * @returns {string} AWS region
 */
const determineS3Region = (asset, itemOrCollection) => {
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

  return process.env['AWS_REGION'] || 'us-west-2'
}

export class AssetProxy {
  constructor() {
    this.bucketsCache = null
    this.bucketOption = process.env['ASSET_PROXY_BUCKET_OPTION'] || 'NONE'
    this.bucketList = process.env['ASSET_PROXY_BUCKET_LIST']
    this.urlExpiry = parseInt(process.env['ASSET_PROXY_URL_EXPIRY'] || '300', 10)
  }

  /**
   * @returns {Promise<void>}
   */
  async initialize() {
    switch (this.bucketOption) {
    case BucketOption.LIST:
      if (this.bucketList) {
        const bucketNames = this.bucketList.split(',').map((b) => b.trim()).filter((b) => b)
        this.bucketsCache = new Set(bucketNames)
        logger.info(
          `Parsed ${this.bucketsCache.size} buckets from ASSET_PROXY_BUCKET_LIST for asset proxy`
        )
      } else {
        throw new Error(
          'ASSET_PROXY_BUCKET_LIST must be set when ASSET_PROXY_BUCKET_OPTION is LIST'
        )
      }
      break

    case BucketOption.ALL_BUCKETS_IN_ACCOUNT:
      try {
        const command = new ListBucketsCommand({})
        const response = await s3Client.send(command)
        const bucketNames = response.Buckets?.map((b) => b.Name)
          ?.filter((name) => typeof name === 'string') || []
        this.bucketsCache = new Set(bucketNames)
        logger.info(`Fetched ${this.bucketsCache.size} buckets from AWS account for asset proxy`)
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
   * @returns {boolean}
   */
  isEnabled() {
    return this.bucketOption !== BucketOption.NONE
  }

  /**
   * @param {string} bucket - S3 bucket name
   * @returns {boolean} True if bucket should be proxied
   */
  shouldProxyBucket(bucket) {
    if (this.bucketOption === BucketOption.ALL || this.bucketsCache?.has(bucket)) {
      return true
    }
    return false
  }

  /**
   * @param {Object} assets - Assets object
   * @param {string} endpoint - API endpoint base URL
   * @param {string} collectionId - Collection ID
   * @param {string|null} itemId - Item ID (null for collection assets)
   * @returns {Object} Object with proxied assets and wasProxied flag
   */
  getProxiedAssets(assets, endpoint, collectionId, itemId) {
    const proxiedAssets = {}
    let wasProxied = false

    for (const [assetKey, asset] of Object.entries(assets)) {
      if (!asset?.href) {
        proxiedAssets[assetKey] = asset
        // eslint-disable-next-line no-continue
        continue
      }

      const s3Info = parseS3Url(asset.href)
      if (!s3Info || !(this.shouldProxyBucket(s3Info.bucket))) {
        proxiedAssets[assetKey] = asset
        // eslint-disable-next-line no-continue
        continue
      }

      wasProxied = true

      const proxyHref = itemId
        ? `${endpoint}/collections/${collectionId}/items/${itemId}/assets/${assetKey}`
        : `${endpoint}/collections/${collectionId}/assets/${assetKey}`

      proxiedAssets[assetKey] = {
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

    return { assets: proxiedAssets, wasProxied }
  }

  /**
   * @param {Array} results - Array of STAC items or collections
   * @param {string} endpoint - API endpoint base URL
   * @returns {Array} Mutated results array with proxied assets
   */
  addProxiedAssets(results, endpoint) {
    if (!this.isEnabled()) {
      return results
    }

    results.forEach((result) => {
      if (!result.assets || typeof result.assets !== 'object') {
        return
      }

      const itemId = result.collection ? result.id : null
      const collectionId = result.collection ? result.collection : result.id

      const { assets, wasProxied } = this.getProxiedAssets(
        result.assets,
        endpoint,
        collectionId,
        itemId
      )

      if (wasProxied) {
        result.assets = assets

        if (!result.stac_extensions) {
          result.stac_extensions = []
        }

        if (!result.stac_extensions.includes(ALTERNATE_ASSETS_EXTENSION)) {
          result.stac_extensions.push(ALTERNATE_ASSETS_EXTENSION)
        }
      }
    })

    return results
  }

  /**
   * @param {string} bucket - S3 bucket name
   * @param {string} key - S3 object key
   * @param {string} region - AWS region of the S3 bucket
   * @returns {Promise<string>} Pre-signed URL
   */
  async createPresignedUrl(bucket, key, region) {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      RequestPayer: 'requester'
    })

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: this.urlExpiry, signingRegion: region
    })

    logger.debug('Generated pre-signed URL for asset', {
      bucket,
      key,
      region,
      urlExpiry: this.urlExpiry,
    })

    return presignedUrl
  }

  /**
   * @param {Object} itemOrCollection - STAC Item or Collection
   * @param {string} assetKey - Asset key to generate presigned URL for
   * @returns {Promise<string|Error>} Pre-signed URL or Error
   */
  async getAssetPresignedUrl(itemOrCollection, assetKey) {
    if (!this.isEnabled()) {
      return new ForbiddenError()
    }

    const asset = itemOrCollection.assets?.[assetKey] || null
    if (!asset || !asset.href) {
      return new NotFoundError()
    }

    const s3Info = parseS3Url(asset.href)
    if (!s3Info) {
      return new ValidationError('Asset href is not a valid S3 URL')
    }

    if (!this.shouldProxyBucket(s3Info.bucket)) {
      return new ForbiddenError()
    }

    const region = s3Info.region || determineS3Region(asset, itemOrCollection)
    const presignedUrl = await this.createPresignedUrl(s3Info.bucket, s3Info.key, region)

    return presignedUrl
  }
}
