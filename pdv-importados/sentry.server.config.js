import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',

  // 10% das transações — suficiente para performance insights sem custo excessivo
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Não enviar ao Sentry em desenvolvimento local
  enabled: process.env.NODE_ENV !== 'development' || Boolean(process.env.SENTRY_FORCE_ENABLE),

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
