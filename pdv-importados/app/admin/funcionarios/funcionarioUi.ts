import type { FuncionarioListRow } from './actions'
import { podeDesativarAlvo, podeEditarAlvo } from './funcionarioPolicies'

export type FuncionarioBloqueioLabels = {
  bloqueioDonoAdmin: string
  bloqueioSemPermissao: string
  bloqueioSiMesmo: string
}

export type FuncionarioGrupoId = 'equipe' | 'protegido'

export type FuncionarioGrupo<T extends Pick<FuncionarioListRow, 'perfil'>> = {
  id: FuncionarioGrupoId
  rows: T[]
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

export function isPerfilProtegido(perfil: string): boolean {
  return perfil === 'DONO' || perfil === 'ADMIN'
}

/** Agrupa OPERADOR/GERENTE vs DONO/ADMIN; omite grupos vazios. */
export function agruparFuncionarios<T extends Pick<FuncionarioListRow, 'perfil'>>(
  rows: T[],
): FuncionarioGrupo<T>[] {
  const equipe: T[] = []
  const protegido: T[] = []
  for (const row of rows) {
    if (isPerfilProtegido(row.perfil)) protegido.push(row)
    else equipe.push(row)
  }
  const grupos: FuncionarioGrupo<T>[] = []
  if (equipe.length > 0) grupos.push({ id: 'equipe', rows: equipe })
  if (protegido.length > 0) grupos.push({ id: 'protegido', rows: protegido })
  return grupos
}

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || typeof HTMLElement === 'undefined') return false
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}
