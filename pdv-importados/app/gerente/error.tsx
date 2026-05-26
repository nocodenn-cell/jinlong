'use client'

export default function GerenteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const showDetail = process.env.NODE_ENV === 'development'

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Erro ao carregar</h1>
      <p className="max-w-sm text-sm opacity-70">
        Não foi possível carregar esta seção. Seus dados não foram alterados.
      </p>
      {showDetail && (
        <p className="max-w-lg break-words font-mono text-xs text-red-400/90">{error.message}</p>
      )}
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Tentar novamente
      </button>
    </div>
  )
}
