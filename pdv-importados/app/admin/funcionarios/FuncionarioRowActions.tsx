'use client'

import { Pencil, UserCheck, UserX } from 'lucide-react'
import { RowActionsMenu, type RowAction } from '@/components/ui/admin-v2'
import type { FuncionarioListRow } from './actions'
import { motivoBloqueioEditar, motivoBloqueioToggle } from './funcionarioUi'

/**
 * Ações de linha do funcionário.
 *
 * Passou a usar o `RowActionsMenu` — o gesto de três pontos que já vale em
 * Compras, Contas a Pagar, Contas a Receber, Vendas e Estoque. Antes esta tela
 * era o quarto padrão paralelo de ação de linha do sistema (dois botões com
 * rótulo), e quem vinha do Bling tinha de aprender um gesto por tela.
 *
 * **A autorização não mudou.** `motivoBloqueioEditar` e `motivoBloqueioToggle`
 * continuam sendo a única fonte do que pode ou não — só a apresentação mudou.
 * E mudou para melhor: antes, um usuário sem permissão para nada via apenas o
 * texto "somente leitura", sem saber por quê; agora a ação aparece
 * desabilitada **com o motivo**, que é a convenção do componente.
 */

type Labels = {
  editar: string
  ativar: string
  desativar: string
  somenteLeitura: string
  bloqueioDonoAdmin: string
  bloqueioSemPermissao: string
  bloqueioSiMesmo: string
  acoesAria: string
}

type Props = {
  row: FuncionarioListRow
  ator: { id: string; perfil: string }
  labels: Labels
  busy: boolean
  onEditar: (row: FuncionarioListRow) => void
  onToggle: (row: FuncionarioListRow) => void
}

export function FuncionarioRowActions({
  row,
  ator,
  labels: L,
  busy,
  onEditar,
  onToggle,
}: Props) {
  const bloqueioEditar = motivoBloqueioEditar(ator, row, L)
  const bloqueioToggle = motivoBloqueioToggle(ator, row, L)
  const toggleLabel = row.ativo ? L.desativar : L.ativar

  const actions: RowAction[] = [
    {
      id: 'editar',
      label: L.editar,
      icon: Pencil,
      disabled: !!bloqueioEditar,
      disabledHint: bloqueioEditar ?? undefined,
      onSelect: () => onEditar(row),
    },
    {
      id: 'toggle',
      label: toggleLabel,
      icon: row.ativo ? UserX : UserCheck,
      destructive: row.ativo,
      disabled: !!bloqueioToggle || busy,
      disabledHint: bloqueioToggle ?? undefined,
      onSelect: () => onToggle(row),
    },
  ]

  return <RowActionsMenu actions={actions} ariaLabel={`${L.acoesAria} ${row.nome}`} />
}
