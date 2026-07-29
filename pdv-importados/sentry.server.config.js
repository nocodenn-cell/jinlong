import * as Sentry from '@sentry/nextjs'
import { resolveSentryEnvironment, resolveSentryRelease } from './lib/observability/sentryEnvironment'

// environment vinha de NODE_ENV, que na Vercel vale 'production' também em
// Preview — Preview e Production ficavam indistinguíveis no Sentry (P1-5).
const environment = resolveSentryEnvironment()

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment,
  // Correlaciona erro ↔ deploy ↔ source map (P1-7).
  release: resolveSentryRelease(),

  // 10% das transações — suficiente para performance insights sem custo excessivo
  tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

  // Não enviar ao Sentry em desenvolvimento local
  enabled: environment !== 'development' || Boolean(process.env.SENTRY_FORCE_ENABLE),

  beforeSend(event) {
    // Ignora erros de ambiente (next-dev, HMR, etc.) em staging/dev remoto
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.value?.includes('NEXT_NOT_FOUND') || ex.value?.includes('NEXT_REDIRECT')) {
          return null
        }
      }
    }
    return event
  },
})
