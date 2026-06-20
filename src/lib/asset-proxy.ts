import {
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3 } from './aws-clients.js'
import logger from './logger.js'
import { AssetBuckets, BucketOptionEnum } from './asset-buckets.js'
import { Assets, StacRecord } from './types.js'
import { isItem } from './stac-utils.js'

const s3Client = s3()

const S3_URL_REGEX = /^s3:\/\/([^/]+)\/(.+)$/

export const ALTERNATE_ASSETS_EXTENSION = 'https://stac-extensions.github.io/alternate-assets/v1.2.0/schema.json'

/**
 * @param {string} s3Url - S3 URL to parse
 * @returns {Object} {bucket, key} or {bucket: null, key: null} if not a valid S3 URL
 */
export const parseS3Url = (s3Url: string): {
  bucket: string | null,
  key: string | null
} => {
  const match = S3_URL_REGEX.exec(s3Url)
  if (!match) return { bucket: null, key: null }

  // const [, bucket, key] = match
  const bucket = match[1] ?? null
  const key = match[2] ?? null
  return { bucket, key }
}

export class AssetProxy {
  buckets: AssetBuckets

  urlExpiry: number

  isEnabled: boolean

  /**
   * @param {AssetBuckets} buckets - AssetBuckets instance
   * @param {number} urlExpiry - Pre-signed URL expiry time in seconds
   * @param {string} bucketOption - Bucket option (NONE, ALL, ALL_BUCKETS_IN_ACCOUNT, LIST)
   */
  constructor(
    buckets: AssetBuckets,
    urlExpiry: number,
    bucketOption: string
  ) {
    this.buckets = buckets
    this.urlExpiry = urlExpiry
    this.isEnabled = bucketOption !== BucketOptionEnum.NONE
  }

  /**
   * @returns {Promise<AssetProxy>} Initialized AssetProxy instance
   */
  static async create(): Promise<AssetProxy> {
    const bucketOption = process.env['ASSET_PROXY_BUCKET_OPTION'] || 'NONE'
    const urlExpiry = parseInt(process.env['ASSET_PROXY_URL_EXPIRY'] || '300', 10)
    const bucketList = process.env['ASSET_PROXY_BUCKET_LIST']

    let bucketNames: string[] | null = null
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
   * get bucket locations of proxied assets
   */
  getProxiedAssets(
    assets: Assets,
    endpoint: string,
    collectionId: string | null,
    itemId: string | null
  ): {assets: Assets, wasProxied: boolean} {
    const proxiedAssets: Assets = {}
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
   * @returns Mutated stacRecord[] array with proxied asset HREFs
   */
  updateAssetHrefs(stacObjects: StacRecord[], endpoint: string): StacRecord[] {
    if (!this.isEnabled) {
      return stacObjects
    }

    stacObjects.forEach((result) => {
      if (!result.assets || typeof result.assets !== 'object') {
        logger.info(`${result.id} has no assets to proxy`)
        return
      }
      const itemId = isItem(result) ? result.id : null
      const collectionId = isItem(result) ? result.collection : result.id

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
   * generate a presinged URL for a specific asset
   * @returns Pre-signed URL or null
   */
  async getAssetPresignedUrl(stacRecord: StacRecord, assetKey: string) {
    const asset = stacRecord.assets?.[assetKey] || null
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
