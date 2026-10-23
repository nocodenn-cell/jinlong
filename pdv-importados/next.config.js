const path = require('path');
const { withSentryConfig } = require('@sentry/nextjs/config');

/** Aliases compartilhados entre Turbopack e Webpack para evitar duplicação. */
const sharedResolveAlias = {
  '@': './src',
  '@/shared': './shared',
  '@shared-core': path.resolve(__dirname, '../shared-core'),
};

/**
 * Cabeçalhos de segurança em todas as respostas (auditoria Vercel 2026-10-15, item B).
 * SAMEORIGIN (e não DENY) mantém o iframe oculto de impressão (lib/print/imprimirNoIframe.ts).
 * CSP fica fora de propósito: exige inventário de scripts (Sentry, Vercel Analytics) antes.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '3mb',
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // `/admin/relatorios` sem `?view=`/`?tab=` → view executiva padrão, como 307
  // real ANTES do render. O mesmo `redirect()` em `page.tsx` roda dentro do
  // Suspense de `app/admin/loading.tsx`: o stream já começou, então o Next
  // devolve 200 + `<meta http-equiv="refresh" content="1;url=...">`, e o
  // documento carregado pelo refresh ficava com as boundaries em `<div hidden>`
  // (sidebar e conteúdo nunca revelados — CI 38656914306, gerente.spec.ts:139).
  // A query original (ex.: `de`/`ate`) é anexada ao destino pelo Next.
  // `?tab=` legado continua tratado em `page.tsx` (`resolverViewRelatorios`).
  async redirects() {
    return [
      {
        source: '/admin/relatorios',
        missing: [
          { type: 'query', key: 'view' },
          { type: 'query', key: 'tab' },
        ],
        destination: '/admin/relatorios?view=vendas-caixas',
        permanent: false,
      },
    ];
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
  // Não faz upload de source maps se DSN não estiver configurado
  disableLogger: true,
  // Não adiciona monitors automáticos do Vercel Cron
  automaticVercelMonitors: false,
  // Release tracking (P1-7): sem isto os source maps enviados não são
  // correlacionados a nenhuma release, e a stack de produção fica minificada
  // no Sentry. VERCEL_GIT_COMMIT_SHA é injetado pela Vercel em todo build.
  // O fallback undefined preserva o comportamento atual em build local.
  release: {
    name: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  },
});