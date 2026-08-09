'use client'

import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FuncionarioListRow } from './actions'
import { motivoBloqueioEditar, motivoBloqueioToggle } from './funcionarioUi'

type Labels = {
  editar: string
  ativar: string
  desativar: string
  somenteLeitura: string
  bloqueioDonoAdmin: string
  bloqueioSemPermissao: string
  bloqueioSiMesmo: string
}

type Props = {
  row: FuncionarioListRow
  ator: { id: string; perfil: string }
  labels: Labels
  busy: boolean
  compactLabels?: boolean
  onEditar: (row: FuncionarioListRow) => void
  onToggle: (row: FuncionarioListRow) => void
}

export function FuncionarioRowActions({
  row,
  ator,
  labels: L,
  busy,
  compactLabels = false,
  onEditar,
  onToggle,
}: Props) {
  const bloqueioEditar = motivoBloqueioEditar(ator, row, L)
  const bloqueioToggle = motivoBloqueioToggle(ator, row, L)
  const podeEditar = !bloqueioEditar
  const podeToggle = !bloqueioToggle
  const toggleLabel = row.ativo ? L.desativar : L.ativar

  if (!podeEditar && !podeToggle) {
    return (
      <span
        className="text-caption text-fg-subtle"
        title={bloqueioEditar ?? L.somenteLeitura}
        aria-label={bloqueioEditar ?? L.somenteLeitura}
        onClick={(e) => e.stopPropagation()}
      >
        {L.somenteLeitura}
      </span>
    )
  }

  return (
    <div
      className="flex flex-wrap items-center justify-end gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!podeEditar}
        title={bloqueioEditar ?? L.editar}
        aria-label={bloqueioEditar ? `${L.editar}: ${bloqueioEditar}` : `${L.editar} — ${row.nome}`}
        onClick={() => onEditar(row)}
        className="gap-1"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        <span className={cn(compactLabels && 'hidden sm:inline')}>{L.editar}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!podeToggle || busy}
        title={bloqueioToggle ?? toggleLabel}
        aria-label={
          bloqueioToggle ? `${toggleLabel}: ${bloqueioToggle}` : `${toggleLabel} — ${row.nome}`
        }
        onClick={() => onToggle(row)}
        className={cn('gap-1', row.ativo && podeToggle && 'text-[var(--color-danger-strong)]')}
      >
        {toggleLabel}
      </Button>
    </div>
  )
}
