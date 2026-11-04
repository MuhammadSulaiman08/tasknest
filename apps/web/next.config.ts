import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@tasknest/shared'],
  // The browser only ever talks to this origin; /api is proxied to the Express API.
  // This keeps the refresh-token cookie first-party in every environment.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
