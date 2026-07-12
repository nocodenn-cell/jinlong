import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  // O middleware roda no runtime edge — inicializa o Sentry lá também.
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.server.config')
  }
}

// Hook exigido pelo Next 15 App Router para capturar erros de Server Components
// aninhados (nested RSC). Substitui a instrumentação implícita antiga.
export const onRequestError = Sentry.captureRequestError
