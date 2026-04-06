import {
  ListBucketsCommand,
  HeadBucketCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3'
import { s3 } from './aws-clients.js'
import logger from './logger.js'

export interface BucketInfo {
  name: string | null
  region: string | null
}
// Follow, rather than throw, HeadBucket redirects for buckets not in the client's region
const s3Client = s3({ followRegionRedirects: true })

export const BucketOptionEnum = Object.freeze({
  NONE: 'NONE',
  ALL: 'ALL',
  ALL_BUCKETS_IN_ACCOUNT: 'ALL_BUCKETS_IN_ACCOUNT',
  LIST: 'LIST'
})

export class AssetBuckets {
  bucketOption: string

  bucketNames: string[] | null

  bucketCache: Record<string, { name: string | null, region: string | null }>

  /**
   * @param {string} bucketOption - Bucket option (NONE, ALL, ALL_BUCKETS_IN_ACCOUNT, LIST)
   * @param {string[]|null} bucketNames - Array of bucket names (required for LIST option)
   */
  constructor(bucketOption, bucketNames) {
    this.bucketOption = bucketOption
    this.bucketNames = bucketNames
    this.bucketCache = {}
  }

  /**
   * @param {string} bucketOption - Bucket option (NONE, ALL, ALL_BUCKETS_IN_ACCOUNT, LIST)
   * @param {string[]|null} bucketNames - Array of bucket names (required for LIST option)
   * @returns {Promise<AssetBuckets>} Initialized AssetBuckets instance
   */
  static async create(bucketOption, bucketNames) {
    const instance = new AssetBuckets(bucketOption, bucketNames)
    await instance._initBuckets()
    return instance
  }

  /**
   * initialize and get basic bucket info
   * @returns {Promise<void>}
   */
  async _initBuckets() {
    switch (this.bucketOption) {
    case BucketOptionEnum.LIST: {
      if (this.bucketNames && this.bucketNames.length > 0) {
        await Promise.all(
          this.bucketNames.map(async (name) => { await this.getBucket(name) })
        )

        const invalidBuckets = Object.keys(this.bucketCache)
          .filter((bucketName) => this.bucketCache[bucketName]?.region === null)
        if (invalidBuckets.length > 0) {
          throw new Error(
            `Could not access or determine region for the following buckets: ${
              invalidBuckets.join(', ')}`
          )
        }

        const bucketNames = Object.keys(this.bucketCache)
        logger.info(
          `Parsed ${bucketNames.length} buckets from ASSET_PROXY_BUCKET_LIST `
          + `for asset proxy: ${bucketNames.join(', ')}`
        )
      } else {
        throw new Error(
          'ASSET_PROXY_BUCKET_LIST must not be empty when ASSET_PROXY_BUCKET_OPTION is LIST'
        )
      }
      break
    }

    case BucketOptionEnum.ALL_BUCKETS_IN_ACCOUNT: {
      const command = new ListBucketsCommand({})
      const response = await s3Client.send(command)
      const buckets = response.Buckets || []

      await Promise.all(
        buckets
          .map((bucket) => bucket.Name)
          .filter((name) => typeof name === 'string')
          .map(async (name) => { await this.getBucket(name) })
      )

      const bucketNames = Object.keys(this.bucketCache)
      logger.info(
        `Fetched ${bucketNames.length} buckets from AWS account `
        + `for asset proxy: ${bucketNames.join(', ')}`
      )
      break
    }

    default:
      break
    }
  }

  async getBucket(bucketName: string): Promise<BucketInfo> {
    if (!(bucketName in this.bucketCache)) {
      const command = new HeadBucketCommand({ Bucket: bucketName })
      let name: string | null = null
      let region: string | null = null

      try {
        const response = await s3Client.send(command)
        name = bucketName
        region = response.BucketRegion === 'EU'
          ? 'eu-west-1'
          : response.BucketRegion || 'us-east-1'
      } catch (err) {
        const error = (err) as S3ServiceException
        const statusCode = error.$metadata?.httpStatusCode

        switch (statusCode) {
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
          logger.error(`Unexpected error for bucket ${bucketName}:`, error)
          throw error
        }
      }

      this.bucketCache[bucketName] = { name, region }
    }
    return this.bucketCache[bucketName]!
  }

  /**
   * @param {string} bucketName - S3 bucket name
   * @returns {boolean} True if bucket should be proxied, False otherwise
   */
  shouldProxyBucket(bucketName: string): boolean {
    if (this.bucketOption === BucketOptionEnum.ALL
      || bucketName in this.bucketCache) {
      return true
    }
    return false
  }
}
