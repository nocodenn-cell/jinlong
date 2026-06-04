'use client'

import { AlertTriangle } from 'lucide-react'
import { DragonModal } from '@/components/ui/DragonModal'
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

  return (
    <DragonModal
      open={row !== null}
      onClose={onClose}
      variant="danger"
      size="sm"
      icon={AlertTriangle}
      title={labels.confirmar_excluir_titulo}
      dismissable={!loading}
      closeLabel={labels.cancelar}
      footer={
        <>
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
        </>
      }
    >
      <p className="pb-1 text-sm app-muted">
        {row ? labels.confirmar_excluir_texto.replace('{{nome}}', row.nome) : ''}
      </p>
    </DragonModal>
  )
}
