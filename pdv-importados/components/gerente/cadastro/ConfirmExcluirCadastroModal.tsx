'use client'

import { useGerenteMutation } from '@/lib/hooks/useGerenteMutation'

type Props = Readonly<{
  row: { id: string; nome: string } | null
  onClose: () => void
  onConfirmed: () => void
  excluirAction: (id: string) => Promise<{ success: boolean; error?: string }>
  labels: {
    confirmar_excluir_titulo: string
    confirmar_excluir_texto: string
    cancelar: string
    excluindo: string
    excluir: string
    excluido_sucesso: string
  }
}>

export function ConfirmExcluirCadastroModal({
  row,
  onClose,
  onConfirmed,
  excluirAction,
  labels,
}: Props) {
  const { mutate: excluir, loading } = useGerenteMutation(
    async () => {
      if (!row) return null
      const r = await excluirAction(row.id)
      if (!r.success) throw new Error(r.error)
      onConfirmed()
      onClose()
      return null
    },
    { successMessage: labels.excluido_sucesso },
  )

  if (!row) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="dragon-elev-2 relative z-10 w-full max-w-sm rounded-2xl p-6">
        <h2 className="mb-2 text-base font-semibold app-surface-text">{labels.confirmar_excluir_titulo}</h2>
        <p className="mb-6 text-sm app-muted">
          {labels.confirmar_excluir_texto.replace('{{nome}}', row.nome)}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium app-muted transition hover:underline"
          >
            {labels.cancelar}
          </button>
          <button
            type="button"
            onClick={() => excluir(undefined)}
            disabled={loading}
            className="inline-flex min-w-[100px] items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? labels.excluindo : labels.excluir}
          </button>
        </div>
      </div>
    </div>
  )
}
