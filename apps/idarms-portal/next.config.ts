import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const zitadelIssuer = process.env.ZITADEL_ISSUER?.replace(/\/+$/, '');
    if (!zitadelIssuer) return [];

    return [{
      source: '/ui/v2/login/:path*',
      destination: `${zitadelIssuer}/ui/v2/login/:path*`,
    }];
  },
};

export default nextConfig;
