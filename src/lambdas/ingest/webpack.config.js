import { resolve } from 'path'
import ZipPlugin from 'zip-webpack-plugin'

const __dirname = resolve()

let mode = 'development'
let devtool = 'inline-source-map'

if (process.env.PRODUCTION) {
  mode = 'production'
  devtool = false
}

export default {
  mode,
  entry: './index.js',
  output: {
    libraryTarget: 'commonjs2',
    filename: 'index.js',
    path: resolve(__dirname, '..', '..', '..', 'dist', 'ingest')
  },
  externals: [
    'aws-sdk'
  ],
  devtool,
  target: 'node',
  plugins: [
    new ZipPlugin({
      filename: 'ingest.zip'
    })
  ]
}
