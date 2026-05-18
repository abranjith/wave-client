//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');

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
    libraryTarget: 'commonjs2',
    clean: {
      keep: /^webview\//,
    },
  },
  externals: {
    vscode: 'commonjs vscode',
    // ws optionally requires these native addons inside try/catch blocks.
    // Keeping them external preserves runtime fallback behavior and removes
    // noisy bundling warnings when they are not installed.
    bufferutil: 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate'
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
  plugins: [
    // VS Code extension host warns/throws when legacy global `navigator`
    // is touched by bundled deps (e.g. axios env checks). Replacing free
    // `navigator` identifiers avoids hitting that getter in Node context.
    new webpack.DefinePlugin({
      navigator: 'undefined'
    })
  ]
};

module.exports = [extensionConfig];
