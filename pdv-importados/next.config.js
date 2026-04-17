/** @type {import('next').NextConfig} */
const nextConfig = {
  // App Router: sem `experimental.appDir` (padrão no Next 13+) e sem `i18n` aqui
  // (i18n do Pages Router não se aplica; mensagens em `@/src/lib/i18n/getMessages`).

  /** Cabeçalhos baseline (OWASP). CSP completo fica para iteração — Next/React exige ajuste fino. */
  async headers() {
    const isProd = process.env.NODE_ENV === 'production'
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
    ]
    if (isProd) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains; preload',
      })
    }
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

module.exports = nextConfig