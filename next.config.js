/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The link preview card reads these at request time (src/server/previewCard.js),
  // so the route's serverless bundle must carry them.
  outputFileTracingIncludes: {
    '/b/[code]/opengraph-image': [
      './node_modules/@fontsource/manrope/files/manrope-latin-800-normal.woff',
      './node_modules/@fontsource/manrope/files/manrope-latin-600-normal.woff',
      './app/icon.svg',
    ],
  },
  async redirects() {
    return [
      {
        source: '/Friendly-Betting',
        destination: '/',
        permanent: false,
      },
      {
        source: '/Friendly-Betting/:path*',
        destination: '/:path*',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
