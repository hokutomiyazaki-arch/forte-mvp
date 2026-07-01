/** @type {import('next').NextConfig} */
const nextConfig = {
  // 認定カード/賞状の @vercel/og ルートが fs.readFile で読む public 素材を
  // サーバーレス関数バンドルに確実に同梱する（Vercelでは public/ は既定でlambda外のため）
  outputFileTracingIncludes: {
    '/api/admin/certification-card/render/front': ['./public/fonts/**', './public/card-assets/**'],
    '/api/admin/certification-card/render/back': ['./public/fonts/**', './public/card-assets/**', './public/medals/**'],
    '/api/admin/certification-card/render/certificate': ['./public/fonts/**', './public/card-assets/**'],
  },
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
      { source: '/myproof', destination: '/', permanent: true },
      { source: '/myproof/:path*', destination: '/', permanent: true },
    ]
  },
};

module.exports = nextConfig;
