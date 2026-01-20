import { resolve } from 'path'
import ZipPlugin from 'zip-webpack-plugin'
import CopyPlugin from 'copy-webpack-plugin'

const __dirname = resolve()

let mode = 'development'
let devtool = 'inline-source-map'

if (process.env['PRODUCTION']) {
  mode = 'production'
  devtool = false
}

export default {
  mode,
  entry: {
      api: './api/index.js',
      ingest: './ingest/index.js',
      'pre-hook': './pre-hook/index.js',
      'post-hook': './post-hook/index.js',
  },
  output: {
    libraryTarget: 'commonjs2',
    filename: '[name]/index.js',
    path: resolve(__dirname, '..', '..', 'dist', 'lambda-dist')
  },
  devtool,
  resolve: {
    extensions: ["", ".webpack.js", ".web.js", ".ts", ".js"],
  },
  target: 'node',
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'api/openapi.yaml',
          to: 'api/openapi.yaml'
        },
        {
          from: 'api/redoc.html',
          to: 'api/redoc.html'
        }
      ]
    }),
    new ZipPlugin({
      filename: 'lambda-dist.zip'
    })
  ]
}
