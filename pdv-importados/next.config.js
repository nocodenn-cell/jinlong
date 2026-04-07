/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  i18n: {
    locales: ['pt', 'zh'],
    defaultLocale: 'pt',
  },
}

module.exports = nextConfig