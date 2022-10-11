const path = require('path')
const ZipPlugin = require('zip-webpack-plugin')

let mode = 'development'
let devtool = 'inline-source-map'

if (process.env.PRODUCTION) {
  mode = 'production'
  devtool = false
}

module.exports = {
  mode,
  entry: './index.js',
  output: {
    libraryTarget: 'commonjs2',
    filename: 'index.js',
    path: path.resolve(__dirname, '..', '..', '..', 'dist', 'pre-hook')
  },
  externals: [
    'aws-sdk'
  ],
  devtool,
  target: 'node',
  plugins: [
    new ZipPlugin({
      filename: 'pre-hook.zip'
    })
  ]
}
