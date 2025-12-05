import { AssetProxy } from '../../src/lib/asset-proxy.js'

const setupAssetProxy = async (assetProxyBucketOption) => {
  const before = { ...process.env }
  try {
    process.env['ASSET_PROXY_BUCKET_OPTION'] = assetProxyBucketOption
    const assetProxy = await AssetProxy.create()
    return assetProxy
  } finally {
    process.env = before
  }
}

export default setupAssetProxy
