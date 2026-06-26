'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { modulo: 'pdv-importados', layer: 'error-boundary-global' },
    })
  }, [error])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Algo deu errado</h1>
      <p className="max-w-md text-sm text-slate-600">
        Não foi possível concluir o carregamento desta página. Tente novamente ou acesse o login.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Tentar de novo
        </button>
        <a
          href="/login"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
        >
          Ir ao login
        </a>
      </div>
    </div>
  )
}
