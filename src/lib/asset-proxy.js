import {
  GetObjectCommand,
  ListBucketsCommand,
  HeadBucketCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3 } from './aws-clients.js'
import logger from './logger.js'

const s3Client = s3()

const S3_URL_REGEX = /^s3:\/\/([^/]+)\/(.+)$/

export const ALTERNATE_ASSETS_EXTENSION = 'https://stac-extensions.github.io/alternate-assets/v1.2.0/schema.json'

export const BucketOption = Object.freeze({
  NONE: 'NONE',
  ALL: 'ALL',
  ALL_BUCKETS_IN_ACCOUNT: 'ALL_BUCKETS_IN_ACCOUNT',
  LIST: 'LIST'
})

/**
 * @param {string} url - S3 URL to parse
 * @returns {Object} {bucket, key} or {bucket: null, key: null} if not a valid S3 URL
 */
const parseS3Url = (url) => {
  const match = S3_URL_REGEX.exec(url)
  if (!match) return { bucket: null, key: null }

  const [, bucket, key] = match
  return { bucket, key }
}

export class AssetProxy {
  constructor() {
    this.bucketOption = process.env['ASSET_PROXY_BUCKET_OPTION'] || 'NONE'
    this.bucketList = process.env['ASSET_PROXY_BUCKET_LIST']
    this.urlExpiry = parseInt(process.env['ASSET_PROXY_URL_EXPIRY'] || '300', 10)
    this.isEnabled = this.bucketOption !== BucketOption.NONE
    this.buckets = {}
  }

  /**
   * @returns {Promise<AssetProxy>} Initialized AssetProxy instance
   */
  static async create() {
    const dbInstance = new AssetProxy()
    await dbInstance._initBuckets()
    return dbInstance
  }

  /**
   * @returns {Promise<void>}
   */
  async _initBuckets() {
    switch (this.bucketOption) {
    case BucketOption.LIST:
      if (this.bucketList) {
        const bucketNames = this.bucketList.split(',').map((b) => b.trim()).filter((b) => b)
        await Promise.all(
          bucketNames.map(async (name) => { await this.getBucket(name) })
        )

        const invalidBuckets = Object.values(this.buckets)
          .filter((b) => b.region === null)
          .map((b) => b.name)
        if (invalidBuckets.length > 0) {
          throw new Error(
            `Could not access or determine region for the following buckets: ${
              invalidBuckets.join(', ')}`
          )
        }

        const count = Object.keys(this.buckets).length
        logger.info(
          `Parsed ${count} buckets from ASSET_PROXY_BUCKET_LIST for asset proxy`
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
        const buckets = response.Buckets || []

        await Promise.all(
          buckets
            .map((bucket) => bucket.Name)
            .filter((name) => typeof name === 'string')
            .map(async (name) => { await this.getBucket(name) })
        )

        const count = Object.keys(this.buckets).length
        logger.info(
          `Fetched ${count} buckets from AWS account for asset proxy`
        )
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
   * @param {string} bucketName - S3 bucket name
   * @returns {Promise<Object>} Bucket info {name, region}
   */
  async getBucket(bucketName) {
    if (!(bucketName in this.buckets)) {
      const command = new HeadBucketCommand({ Bucket: bucketName })
      const response = await s3Client.send(command)
      const statusCode = response.$metadata.httpStatusCode
      let region = null

      switch (statusCode) {
      case 200:
        region = response.BucketRegion === 'EU'
          ? 'eu-west-1'
          : response.BucketRegion || 'us-east-1'
        break
      case 403:
        logger.warn(`Access denied to bucket ${bucketName}`)
        break
      case 404:
        logger.warn(`Bucket ${bucketName} does not exist`)
        break
      case 400:
        logger.warn(`Bad request for bucket ${bucketName}`)
        break
      default:
        logger.warn(`Unexpected status code ${statusCode} for bucket ${bucketName}`)
      }

      this.buckets[bucketName] = { name: bucketName, region }
    }
    return this.buckets[bucketName]
  }

  /**
   * @param {string} bucketName - S3 bucket name
   * @returns {boolean} True if bucket should be proxied, False otherwise
   */
  shouldProxyBucket(bucketName) {
    if (this.bucketOption === BucketOption.ALL
      || bucketName in this.buckets) {
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

      if (!this.shouldProxyBucket(bucket)) {
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
    if (!bucket || !key || !this.shouldProxyBucket(bucket)) {
      return null
    }

    const region = await this.getBucket(bucket).then((b) => b.region)
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
