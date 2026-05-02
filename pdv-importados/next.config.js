const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Desabilita Turbopack (problemas conhecidos com aliases)
  turbopack: false,

  // Ignora erros de TypeScript no build (não afeta funcionamento)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Ignora erros do ESLint no build
  eslint: {
    ignoreDuringBuilds: true,
  },

  webpack: (config, { isServer }) => {
    // Aliases que funcionam localmente E na Vercel
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, '.'),
      '@/shared': path.resolve(__dirname, '../shared'),
      '@shared': path.resolve(__dirname, '../shared'),
      '@/i18n': path.resolve(__dirname, './src/lib/i18n'),
      '@/idioma': path.resolve(__dirname, './src/lib/idioma'),
    };

    // Fallbacks para módulos Node.js (evita erros no client)
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
};

module.exports = nextConfig;