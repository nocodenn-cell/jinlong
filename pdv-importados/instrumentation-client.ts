/**
 * Sentry — runtime do browser.
 *
 * Substitui `sentry.client.config.js`. O SDK v10 ainda reconhece o nome antigo
 * sob webpack, mas emite DEPRECATION WARNING e o arquivo **deixa de funcionar
 * sob Turbopack**. Como o Next está migrando para Turbopack por default, migrar
 * agora evita perder a instrumentação de browser silenciosamente num upgrade.
 *
 * Conteúdo preservado 1:1 do arquivo anterior, com duas correções:
 *   - environment vem de VERCEL_ENV (P1-5), não de NODE_ENV
 *   - release fixado no SHA do commit (P1-7)
 */

import * as Sentry from '@sentry/nextjs'
import { resolveSentryEnvironment, resolveSentryRelease } from './lib/observability/sentryEnvironment'
import { redigir } from './lib/observability/redact'

const environment = resolveSentryEnvironment()

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment,
  release: resolveSentryRelease(),

  // 10% das transações em produção
  tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

  // Replays: apenas nas sessões com erro (sem custo de storage desnecessário)
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.0,

  enabled: environment !== 'development' || Boolean(process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE),

  integrations: [
    Sentry.replayIntegration({
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
    // Redação por último: o filtro acima precisa ler `ex.value` ainda íntegro.
    return redigir(event)
  },
})

// Instrumenta as transições de rota do App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
