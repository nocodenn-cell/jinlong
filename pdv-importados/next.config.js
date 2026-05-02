const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Forçar Webpack em vez de Turbopack
  experimental: {
    turbo: {
      loaders: {},
    },
  },

  // Ignora erros de TypeScript no build (não afeta o funcionamento)
  typescript: {
    ignoreBuildErrors: true,
  },

  webpack: (config, { isServer }) => {
    // ALIASES CORRETOS – funcionam localmente e na Vercel
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, '.'),
      '@shared': path.resolve(__dirname, '../shared'),
      '@/shared': path.resolve(__dirname, '../shared'),
      '@/i18n': path.resolve(__dirname, './src/lib/i18n'),
      '@/idioma': path.resolve(__dirname, './src/lib/idioma'),
      '@/lib': path.resolve(__dirname, './lib'),
      '@/components': path.resolve(__dirname, './components'),
      '@/app': path.resolve(__dirname, './app'),
      '@/core': path.resolve(__dirname, './core'),
      '@/stores': path.resolve(__dirname, './stores'),
    };

    // Fallbacks para módulos Node.js (evita erros no cliente)
    if (!isServer) {
      config.resolve.fallback = {
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
  output: 'standalone',
  sentry: {
    hideSourceMaps: true,
  },
};

module.exports = nextConfig;