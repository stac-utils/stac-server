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
    path: resolve(__dirname, '..', '..', '..', 'dist', 'post-hook')
  },
  externals: [
    'aws-sdk'
  ],
  devtool,
  resolve: {
    extensions: ["", ".webpack.js", ".web.js", ".ts", ".js"],
  },
  target: 'node',
  plugins: [
    new ZipPlugin({
      filename: 'post-hook.zip'
    })
  ]
}
