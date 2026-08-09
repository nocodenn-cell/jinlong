import type { FuncionarioListRow } from './actions'
import { podeDesativarAlvo, podeEditarAlvo } from './funcionarioPolicies'

export type FuncionarioBloqueioLabels = {
  bloqueioDonoAdmin: string
  bloqueioSemPermissao: string
  bloqueioSiMesmo: string
}

/** Motivo legível para bloquear edição — UI only; policies inalteradas. */
export function motivoBloqueioEditar(
  ator: { id: string; perfil: string },
  row: Pick<FuncionarioListRow, 'id' | 'perfil'>,
  L: FuncionarioBloqueioLabels,
): string | null {
  if (podeEditarAlvo(ator, row)) return null
  if (row.perfil === 'DONO' || row.perfil === 'ADMIN') return L.bloqueioDonoAdmin
  return L.bloqueioSemPermissao
}

/** Motivo legível para bloquear ativar/desativar — UI only. */
export function motivoBloqueioToggle(
  ator: { id: string; perfil: string },
  row: Pick<FuncionarioListRow, 'id' | 'perfil'>,
  L: FuncionarioBloqueioLabels,
): string | null {
  if (podeDesativarAlvo(ator, row)) return null
  if (ator.id === row.id) return L.bloqueioSiMesmo
  return motivoBloqueioEditar(ator, row, L) ?? L.bloqueioSemPermissao
}
