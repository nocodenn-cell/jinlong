const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  turbopack: {
    resolveAlias: {
      '@': path.resolve(__dirname, '.'),
      '@/shared': path.resolve(__dirname, './src/shared'),
    },
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, '.'),
      '@/shared': path.resolve(__dirname, './src/shared'),
    };
    if (!isServer) {
      config.resolve.fallback = { fs: false, net: false, tls: false, crypto: false, stream: false, url: false, zlib: false, http: false, https: false, assert: false, os: false, path: false };
    }
    return config;
  },
};

module.exports = nextConfig;
