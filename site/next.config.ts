import path from 'node:path'
import type { NextConfig } from 'next'
import { buildErpRedirects, buildWwwToApexRedirect } from './lib/erpRedirects'
import { buildSecurityHeaders } from './lib/securityHeaders'
import { getSiteUrl } from './lib/siteUrl'

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
    // Ordem importa: caminhos do ERP primeiro (www/login → app em um salto), depois www → apex.
    return [...buildErpRedirects(), ...buildWwwToApexRedirect(getSiteUrl())]
  },
}

export default nextConfig
