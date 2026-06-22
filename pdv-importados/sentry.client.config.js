import * as Sentry from '@sentry/nextjs'
import { replayIntegration } from '@sentry/browser'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',

  // 10% das transações em produção
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Replays: apenas nas sessões com erro (sem custo de storage desnecessário)
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.0,

  enabled: process.env.NODE_ENV !== 'development' || Boolean(process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE),

  integrations: [
    replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  beforeSend(event) {
    // Ignora erros de extensões de browser (não são do app)
    if (event.exception?.values) {
      for (const ex of event.exception.values) {
        if (ex.stacktrace?.frames?.every((f) => f.filename?.startsWith('chrome-extension://'))) {
          return null
        }
      }
    }
    return event
  },
})
