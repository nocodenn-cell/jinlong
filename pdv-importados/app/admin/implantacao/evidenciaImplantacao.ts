/**
 * Regra de ouro War Room: CONCLUIDO exige evidência operacional.
 */

import type { ItemStatus } from './implantacaoCatalog'

const MIN_EVIDENCIA = 3

/** Retorna mensagem de erro ou null se válido. */
export function erroEvidenciaConcluido(
  status: ItemStatus,
  evidencia: string | null | undefined,
): string | null {
  if (status !== 'CONCLUIDO') return null
  const t = evidencia?.trim() ?? ''
  if (t.length < MIN_EVIDENCIA) {
    return `Evidência obrigatória para marcar CONCLUIDO (mín. ${MIN_EVIDENCIA} caracteres: ID venda, print, log…).`
  }
  return null
}

export type TimelineEvento = Readonly<{
  key: string
  concluidoEm: string
  responsavel: string | null
  evidencia: string | null
}>

/** Ordena itens concluídos do mais recente ao mais antigo. */
export function montarTimeline(
  itens: ReadonlyArray<{
    key: string
    status: ItemStatus
    concluido_em: string | null
    responsavel: string | null
    observacoes: string | null
  }>,
): TimelineEvento[] {
  return itens
    .filter((i) => i.status === 'CONCLUIDO' && i.concluido_em)
    .map((i) => ({
      key: i.key,
      concluidoEm: i.concluido_em as string,
      responsavel: i.responsavel,
      evidencia: i.observacoes,
    }))
    .sort((a, b) => (a.concluidoEm < b.concluidoEm ? 1 : -1))
}
