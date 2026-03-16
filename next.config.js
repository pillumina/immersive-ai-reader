/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Handle canvas and pdf.js dependencies
    config.resolve.alias.canvas = false;

    // Handle PDF.js worker
    config.module.rules.push({
      test: /pdf\.worker\.(min\.)?js/,
      type: 'asset/resource',
      generator: {
        filename: 'static/[hash].[ext]',
      },
    });

    return config;
  },
};

module.exports = nextConfig;
