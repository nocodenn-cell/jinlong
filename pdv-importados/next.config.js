const { withSentryConfig } = require('@sentry/nextjs')
const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['shared'],
  output: 'standalone',
  eslint: { ignoreDuringBuilds: false },
  typescript: { 
    ignoreBuildErrors: true, // Temporariamente para testar aliases
    tsconfigPath: './tsconfig.json',
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Aliases explícitos e robustos para resolver @/shared e outras pastas
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, '.'),
      '@/shared': path.resolve(__dirname, '../../shared'), // Caminho correto para pasta shared na raiz
      '@/i18n': path.resolve(__dirname, './src/lib/i18n'),
      '@/idioma': path.resolve(__dirname, './src/lib/idioma'),
      '@/lib': path.resolve(__dirname, './lib'),
      '@/components': path.resolve(__dirname, './components'),
      '@/app': path.resolve(__dirname, './app'),
      '@/core': path.resolve(__dirname, './core'),
      '@/stores': path.resolve(__dirname, './stores'),
    }

    // Fallback para módulos Node.js que podem ser necessários
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
      stream: false,
      url: false,
      zlib: false,
      http: false,
      https: false,
      assert: false,
      os: false,
      path: false,
    }

    return config
  },
  /**
   * Cabeçalhos baseline (defesa em profundidade).
   * CSP completa costuma exigir nonces/hashes com Next + scripts inline; trate em fase dedicada.
   */
  async headers() {
    const base = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      },
    ]
    const hsts =
      process.env.VERCEL_ENV === 'production' ||
      (process.env.NODE_ENV === 'production' && !process.env.VERCEL)
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' }]
        : []
    return [
      {
        source: '/:path*',
        headers: [...base, ...hsts],
      },
    ]
  },
}

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  dsn: process.env.SENTRY_DSN,
  release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
})