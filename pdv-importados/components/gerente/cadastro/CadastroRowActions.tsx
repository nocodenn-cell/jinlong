'use client'

import { Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'

type Props<T> = Readonly<{
  row: T & { ativo: boolean }
  onEditar: (row: T) => void
  onExcluir: (row: T) => void
  onToggleAtivo: (row: T) => void
  labels: { inativar: string; ativar: string; editar: string; excluir: string }
}>

export function CadastroRowActions<T extends { ativo: boolean }>({
  row,
  onEditar,
  onExcluir,
  onToggleAtivo,
  labels,
}: Props<T>) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        title={row.ativo ? labels.inativar : labels.ativar}
        onClick={() => onToggleAtivo(row)}
        className="gerente-chip-action rounded-md border p-1.5 opacity-70 transition hover:opacity-100 app-border"
      >
        {row.ativo ? (
          <ToggleRight className="h-4 w-4 text-emerald-400" />
        ) : (
          <ToggleLeft className="h-4 w-4 app-muted" />
        )}
      </button>
      <button
        type="button"
        title={labels.editar}
        onClick={() => onEditar(row)}
        className="gerente-chip-action rounded-md border p-1.5 opacity-70 transition hover:opacity-100 app-border"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={labels.excluir}
        onClick={() => onExcluir(row)}
        className="gerente-chip-action rounded-md border p-1.5 opacity-70 transition hover:opacity-100 app-border app-badge-danger"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
