/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'eikzgzqnydptpqjwxbfu.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/for-stores',
        destination: '/for-stores.html',
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/sign-in',
        permanent: true,
      },
      {
        source: '/login/:path*',
        destination: '/sign-in',
        permanent: true,
      },
      { source: '/mycard', destination: '/', permanent: true },
      { source: '/mycard/:path*', destination: '/', permanent: true },
    ]
  },
};

module.exports = nextConfig;
