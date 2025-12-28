//@ts-check

'use strict';

const path = require('path');

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'none',

  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        // Exclude webview files - they are built separately with esbuild-loader
        exclude: (modulePath) => {
          // Normalize path separators for cross-platform compatibility
          const normalized = modulePath.replace(/\\/g, '/');
          return normalized.includes('/node_modules/') || normalized.includes('/src/webview/');
        },
        use: [
          {
            loader: 'ts-loader',
            options: {
              // Use separate tsconfig that excludes webview files
              configFile: path.resolve(__dirname, 'tsconfig.extension.json')
            }
          }
        ]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: {
    level: "log",
  },
};

module.exports = [extensionConfig];
