import {
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3 } from './aws-clients.js'
import logger from './logger.js'
import { AssetBuckets, BucketOptionEnum } from './asset-buckets.js'

const s3Client = s3()

const S3_URL_REGEX = /^s3:\/\/([^/]+)\/(.+)$/

export const ALTERNATE_ASSETS_EXTENSION = 'https://stac-extensions.github.io/alternate-assets/v1.2.0/schema.json'

/**
 * @param {string} url - S3 URL to parse
 * @returns {Object} {bucket, key} or {bucket: null, key: null} if not a valid S3 URL
 */
export const parseS3Url = (url) => {
  const match = S3_URL_REGEX.exec(url)
  if (!match) return { bucket: null, key: null }

  const [, bucket, key] = match
  return { bucket, key }
}

export class AssetProxy {
  /**
   * @param {AssetBuckets} buckets - AssetBuckets instance
   * @param {number} urlExpiry - Pre-signed URL expiry time in seconds
   * @param {string} bucketOption - Bucket option (NONE, ALL, ALL_BUCKETS_IN_ACCOUNT, LIST)
   */
  constructor(buckets, urlExpiry, bucketOption) {
    this.buckets = buckets
    this.urlExpiry = urlExpiry
    this.isEnabled = bucketOption !== BucketOptionEnum.NONE
  }

  /**
   * @returns {Promise<AssetProxy>} Initialized AssetProxy instance
   */
  static async create() {
    const bucketOption = process.env['ASSET_PROXY_BUCKET_OPTION'] || 'NONE'
    const urlExpiry = parseInt(process.env['ASSET_PROXY_URL_EXPIRY'] || '300', 10)
    const bucketList = process.env['ASSET_PROXY_BUCKET_LIST']

    let bucketNames = null
    if (bucketOption === BucketOptionEnum.LIST) {
      if (!bucketList) {
        throw new Error(
          'ASSET_PROXY_BUCKET_LIST must be set when ASSET_PROXY_BUCKET_OPTION is LIST'
        )
      }
      bucketNames = bucketList.split(',').map((b) => b.trim()).filter((b) => b)
    }

    const buckets = await AssetBuckets.create(bucketOption, bucketNames)

    return new AssetProxy(buckets, urlExpiry, bucketOption)
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
        logger.warn(`Asset ${assetKey} is missing href`)
        // eslint-disable-next-line no-continue
        continue
      }

      const { bucket, key } = parseS3Url(asset.href)
      if (!bucket || !key) {
        proxiedAssets[assetKey] = asset
        logger.warn(`Asset ${assetKey} has invalid S3 URL: ${asset.href}`)
        // eslint-disable-next-line no-continue
        continue
      }

      if (!this.buckets.shouldProxyBucket(bucket)) {
        proxiedAssets[assetKey] = asset
        logger.warn(`Asset ${assetKey} bucket ${bucket} is not configured for proxying`)
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
   * @param {Array} stacObjects - Array of STAC items or collections
   * @param {string} endpoint - API endpoint base URL
   * @returns {Array} Mutated stacObjects array with proxied asset HREFs
   */
  updateAssetHrefs(stacObjects, endpoint) {
    if (!this.isEnabled) {
      return stacObjects
    }

    stacObjects.forEach((result) => {
      if (!result.assets || typeof result.assets !== 'object') {
        logger.info(`${result.id} has no assets to proxy`)
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

    return stacObjects
  }

  /**
   * @param {Object} itemOrCollection - STAC Item or Collection
   * @param {string} assetKey - Asset key to generate presigned URL for
   * @returns {Promise<string|null>} Pre-signed URL or null
   */
  async getAssetPresignedUrl(itemOrCollection, assetKey) {
    const asset = itemOrCollection.assets?.[assetKey] || null
    if (!asset || !asset.href) {
      return null
    }

    const { bucket, key } = parseS3Url(asset.href)
    if (!bucket || !key || !this.buckets.shouldProxyBucket(bucket)) {
      return null
    }

    const region = await this.buckets.getBucket(bucket).then((b) => b.region)
    if (!region) {
      // Should not get here if bucketOption is LIST or ALL_BUCKETS_IN_ACCOUNT
      // If bucketOption is ALL, the bucket either does not exist or access is denied
      logger.warn(`Bucket ${bucket} does not exist or access is denied`)
      return null
    }

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
}
