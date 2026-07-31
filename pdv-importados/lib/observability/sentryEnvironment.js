/**
 * Resolução de `environment` para o Sentry (P1-5).
 *
 * PROBLEMA: os configs usavam `process.env.NODE_ENV`. Na Vercel, NODE_ENV vale
 * 'production' tanto em Preview quanto em Production, então erros de branch de
 * teste e erros de cliente real chegavam ao Sentry com a MESMA tag. Não havia
 * como saber se um erro veio de produção.
 *
 * SOLUÇÃO: VERCEL_ENV, que a plataforma injeta com 'production' | 'preview' |
 * 'development'. Fora da Vercel cai em NODE_ENV e depois 'development'.
 *
 * Compartilhado entre client/server/edge para que os três concordem — se cada
 * config resolvesse por conta própria, voltaríamos a ter ambientes divergentes.
 *
 * .js e não .ts de propósito: é consumido pelos sentry.*.config.js, que rodam
 * antes do pipeline de TS do Next.
 */

function resolveSentryEnvironment() {
  // NEXT_PUBLIC_ prefixado para ficar disponível também no bundle do browser,
  // onde process.env.VERCEL_ENV não é inlined automaticamente.
  const fromVercel = process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.VERCEL_ENV
  if (fromVercel) return fromVercel
  return process.env.NODE_ENV || 'development'
}

/**
 * Release = SHA do commit, para correlacionar erro ↔ deploy ↔ source map (P1-7).
 * Precisa bater com o `release.name` configurado no withSentryConfig.
 */
function resolveSentryRelease() {
  return (
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    undefined
  )
}

module.exports = { resolveSentryEnvironment, resolveSentryRelease }
