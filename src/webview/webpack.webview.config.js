
const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: './src/webview/index.tsx',
  output: {
    path: path.resolve(__dirname, '../../dist/webview'),
    filename: 'webview.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      // CSS is now handled by Tailwind CLI, so we skip CSS processing in webpack
      // {
      //   test: /\.css$/,
      //   use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
      // },
    ],
  },
  devtool: 'source-map',
  plugins: [
    // CSS plugin removed since we handle CSS separately
    // new MiniCssExtractPlugin({
    //   filename: 'index.css',
    // }),
  ],
};
