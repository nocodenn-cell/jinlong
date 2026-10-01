'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { ErrorState } from '@/components/ui/feedback'

/**
 * Error boundary do segmento /admin. Como fica abaixo do layout, o AdminV2Shell
 * (sidebar/navegação) permanece visível quando uma página interna falha.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { modulo: 'pdv-importados', layer: 'error-boundary-admin' },
    })
  }, [error])

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <ErrorState
        title="Algo deu errado"
        description="Não foi possível carregar esta página. Você pode tentar de novo ou usar o menu para ir a outra área."
        onRetry={() => reset()}
        retryLabel="Tentar de novo"
        className="w-full max-w-md"
      />
    </div>
  )
}
