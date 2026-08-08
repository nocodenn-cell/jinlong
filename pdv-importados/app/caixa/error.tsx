'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/feedback'

export default function CaixaError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        modulo: 'pdv-sale',
        plataforma: 'web',
        layer: 'error-boundary-caixa',
      },
    })
  }, [error])

  return (
    <div className="caixa-oriental-root flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4 py-8">
      <ErrorState
        title="Erro no ponto de venda"
        description="Ocorreu um erro inesperado no PDV. O carrinho costuma permanecer no navegador — se o problema persistir, recarregue a página ou chame o gerente."
        onRetry={() => reset()}
        retryLabel="Tentar de novo"
        className="w-full max-w-md"
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => window.location.reload()}
        className="fp-focus-ring"
      >
        Recarregar página
      </Button>
    </div>
  )
}
