'use client'

import { Button } from '@/components/ui/button'
import { RowActionsMenu, type RowMenuItem } from '@/components/ui/RowActionsMenu'
import { adminComissoesOperadorQuery } from '@/lib/navigation/routes'
import type { FuncionarioListRow } from './actions'
import { motivoBloqueioEditar, motivoBloqueioToggle } from './funcionarioUi'

type Labels = {
  editar: string
  verComissoes: string
  ativar: string
  desativar: string
  somenteLeitura: string
  bloqueioDonoAdmin: string
  bloqueioSemPermissao: string
  bloqueioSiMesmo: string
  menuMais: string
}

type Props = {
  row: FuncionarioListRow
  ator: { id: string; perfil: string }
  labels: Labels
  busy: boolean
  onEditar: (row: FuncionarioListRow) => void
  onToggle: (row: FuncionarioListRow) => void
  onBeforeNavigate?: () => void
}

export function FuncionarioRowActions({
  row,
  ator,
  labels: L,
  busy,
  onEditar,
  onToggle,
  onBeforeNavigate,
}: Props) {
  const bloqueioEditar = motivoBloqueioEditar(ator, row, L)
  const bloqueioToggle = motivoBloqueioToggle(ator, row, L)
  const itens = itensMenu(row, L, !bloqueioToggle && !busy, onToggle)
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {bloqueioEditar ? (
        <span className="text-caption text-fg-subtle" title={bloqueioEditar}>{L.somenteLeitura}</span>
      ) : (
        <Button type="button" size="sm" variant="ghost" aria-label={`${L.editar} — ${row.nome}`} onClick={() => onEditar(row)}>
          {L.editar}
        </Button>
      )}
      <RowActionsMenu label={`${L.menuMais} — ${row.nome}`} items={itens} onBeforeNavigate={onBeforeNavigate} />
    </div>
  )
}

function itensMenu(
  row: FuncionarioListRow,
  L: Labels,
  podeToggle: boolean,
  onToggle: (row: FuncionarioListRow) => void,
): RowMenuItem[] {
  const itens: RowMenuItem[] = []
  if (row.perfil === 'OPERADOR' || row.perfil === 'GERENTE') {
    itens.push({
      id: 'comissoes',
      label: L.verComissoes,
      href: adminComissoesOperadorQuery(row.id),
      testId: 'funcionario-ver-comissoes',
    })
  }
  if (podeToggle) {
    itens.push({
      id: 'acesso',
      label: row.ativo ? L.desativar : L.ativar,
      danger: row.ativo,
      onClick: () => onToggle(row),
    })
  }
  return itens
}
