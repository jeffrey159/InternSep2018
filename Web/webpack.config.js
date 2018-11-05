const path = require('path');

module.exports = {
    entry:[
        './index.js',
    ],
    output: {
        filename: 'bundleee.js',
        path: path.resolve(__dirname, 'public')
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /(node_modules|bower_components)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            }
        ]
    },
    devServer: {
        host: "0.0.0.0",
        port: 8008
  },
};
