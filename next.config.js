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
    ]
  },
};

module.exports = nextConfig;
