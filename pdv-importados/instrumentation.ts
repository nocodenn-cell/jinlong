import * as Sentry from '@sentry/nextjs'

/**
 * Hook de instrumentação do Next (server + edge).
 *
 * Antes registrava apenas o runtime `nodejs`. Faltavam duas coisas (P1-4):
 *   - o branch `edge`, então erro em middleware não era capturado;
 *   - o export `onRequestError`, que no App Router do Next 15 é o único caminho
 *     pelo qual erros de React Server Components e route handlers chegam ao
 *     Sentry. Sem ele, essa classe de erro de servidor não era reportada.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
