const path = require('path');
const { withSentryConfig } = require('@sentry/nextjs');

/** Aliases compartilhados entre Turbopack e Webpack para evitar duplicação. */
const sharedResolveAlias = {
  '@': './src',
  '@/shared': './shared',
  '@shared-core': path.resolve(__dirname, '../shared-core'),
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '3mb',
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  turbopack: {
    resolveAlias: sharedResolveAlias,
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...sharedResolveAlias,
    };

    // Fix for client-side builds
    if (!isServer) {
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
      };
    }

    return config;
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Silencia output do Sentry no CI/CD para não poluir logs
  silent: !process.env.CI,
  // Source maps ocultos no bundle público
  hideSourceMaps: true,
  // Opções de build migradas para o wrapper `webpack` (Sentry SDK v10):
  webpack: {
    // Substitui `disableLogger` (depreciado): remove logs de debug do SDK no bundle.
    treeshake: {
      removeDebugLogging: true,
    },
    // Substitui o `automaticVercelMonitors` de topo (depreciado): sem monitors de Cron automáticos.
    automaticVercelMonitors: false,
  },
});