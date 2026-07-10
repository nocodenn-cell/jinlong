'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'

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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Erro no ponto de venda</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Ocorreu um erro inesperado no PDV. Seus dados no carrinho não foram perdidos.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={() => reset()}>
          Tentar de novo
        </Button>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          Recarregar página
        </Button>
      </div>
    </div>
  )
}
