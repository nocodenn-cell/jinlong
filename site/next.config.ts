import path from 'node:path'
import type { NextConfig } from 'next'
import { buildErpRedirects } from './lib/erpRedirects'
import { buildSecurityHeaders } from './lib/securityHeaders'

const isDev = process.env.NODE_ENV !== 'production'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Lint roda em `npm run lint` (reutiliza o ESLint do ERP); não duplica no build.
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: buildSecurityHeaders(isDev) }]
  },
  async redirects() {
    return buildErpRedirects()
  },
}

export default nextConfig
