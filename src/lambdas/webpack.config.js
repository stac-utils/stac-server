import { resolve } from 'path'
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
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
  module: {
    rules: [
      {
        test: /\.[jt]s$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: {
              module: 'esnext',
              moduleResolution: 'bundler',
            },
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  target: 'node',
  plugins: [
    new CopyPlugin({
      patterns: [
        // The API lambda resolves these against LAMBDA_TASK_ROOT (the ZIP root),
        // so they must land at the top level of the combined dist.
        {
          from: 'api/openapi.yaml',
          to: 'openapi.yaml'
        },
        {
          from: 'api/redoc.html',
          to: 'redoc.html'
        }
      ]
    }),
    new ZipPlugin({
      filename: 'lambda-dist.zip'
    })
  ]
}
