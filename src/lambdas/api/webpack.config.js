import {resolve } from 'path'
import ZipPlugin from 'zip-webpack-plugin'
import CopyPlugin from 'copy-webpack-plugin'

const __dirname = resolve()

let mode = 'development'
/**
 * @type string | boolean
 */
let devtool = 'inline-source-map'

if (process.env['PRODUCTION']) {
  mode = 'production'
  devtool = false
}

export default {
  mode,
  entry: './index.js',
  output: {
    libraryTarget: 'commonjs2',
    filename: 'index.js',
    path: resolve(__dirname, '..', '..', '..', 'dist', 'api')
  },
  devtool,
  resolve: {
    extensions: ["", ".webpack.js", ".web.js", ".ts", ".js"],
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  optimization: {
    usedExports: true
  },
  target: 'node',
  node: {
    __dirname: false,
    __filename: false
  },
  plugins: [
    new CopyPlugin({
      patterns: [{
        from: 'openapi.yaml',
        to: 'openapi.yaml'
      },
      {
        from: 'redoc.html',
        to: 'redoc.html'
      }
    ]
    }),
    new ZipPlugin({
      filename: 'api.zip'
    })
  ]
}
