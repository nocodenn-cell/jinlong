'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-xl font-semibold">Erro crítico</h1>
          <p className="max-w-md text-sm text-slate-600">
            A aplicação encontrou um erro inesperado. Recarregue a página ou tente novamente em instantes.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  )
}
