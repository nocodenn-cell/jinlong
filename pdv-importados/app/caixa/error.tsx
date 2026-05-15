'use client'

export default function CaixaError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Erro no ponto de venda</h1>
      <p className="max-w-sm text-sm opacity-70">
        Ocorreu um erro inesperado no PDV. Seus dados no carrinho não foram perdidos.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Tentar de novo
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
        >
          Recarregar página
        </button>
      </div>
    </div>
  )
}
