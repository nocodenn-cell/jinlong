const path = require("path");
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: false,
  },

  turbopack: {
    resolveAlias: {
      "@": "./src",
      "@/shared": "./shared",
      "@shared-core": path.resolve(__dirname, "../shared-core"),
    },
  },

  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": "./src",
      "@/shared": "./shared",
      "@shared-core": path.resolve(__dirname, "../shared-core"),
    };

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
  org: "damatta",

  project: "fastproduct-pdv",

  silent: !process.env.CI,

  widenClientFileUpload: true,

  hideSourceMaps: true,

  tunnelRoute: "/monitoring",

  disableLogger: true,

  automaticVercelMonitors: true,

  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});