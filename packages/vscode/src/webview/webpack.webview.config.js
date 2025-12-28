
const path = require('path');

module.exports = {
  entry: './src/webview/index.tsx',
  output: {
    path: path.resolve(__dirname, '../../dist/webview'),
    filename: 'webview.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    // Support workspace packages
    symlinks: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'esbuild-loader',
        options: {
          target: 'es2020',
          loader: 'tsx',
        },
        // Include @wave-client/core from node_modules
        exclude: /node_modules\/(?!@wave-client)/,
      },
    ],
  },
  devtool: 'source-map',
  plugins: [],
};
