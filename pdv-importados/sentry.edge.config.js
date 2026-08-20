/**
 * Sentry — runtime edge (middleware e route handlers com `runtime = 'edge'`).
 *
 * Este arquivo NÃO EXISTIA (P1-4). Sem ele, exceções levantadas no middleware
 * — que é onde passa a autenticação de todas as rotas — não chegavam ao Sentry.
 * Falha de auth em produção era invisível.
 *
 * Espelha sentry.server.config.js; só muda o runtime que instrumenta.
 */

import * as Sentry from '@sentry/nextjs'
import { resolveSentryEnvironment, resolveSentryRelease } from './lib/observability/sentryEnvironment'
import { redigir } from './lib/observability/redact'

const environment = resolveSentryEnvironment()

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment,
  release: resolveSentryRelease(),

  // Mesmo sampling do server: 10% em produção.
  tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

  enabled: environment !== 'development' || Boolean(process.env.SENTRY_FORCE_ENABLE),

  beforeSend(event) {
    // NEXT_NOT_FOUND / NEXT_REDIRECT são controle de fluxo do Next, não erro.
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.value?.includes('NEXT_NOT_FOUND') || ex.value?.includes('NEXT_REDIRECT')) {
          return null
        }
      }
    }
    // Redação por último: o filtro acima precisa ler `ex.value` ainda íntegro.
    return redigir(event)
  },
})
