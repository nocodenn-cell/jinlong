/** Validações puras de remessa — fora de `'use server'` para compatibilidade com Next (Server Actions só async). */

import type { StatusOC } from '@/app/gerente/compras/actions'

/**
 * S8/RM-14 — vínculo opcional do recebimento manual com uma Ordem de Compra.
 * Validação de aplicação (Opção 1), não trava de RPC: `origem_tipo`/`origem_ref`
 * continuam sendo só pré-preenchimento (ver COMMENT da coluna em
 * `20260824010000_fix_remessas_conferencia_columns_drift.sql`) — esta função
 * não os lê nem os escreve, só decide se o vínculo pode seguir.
 *
 * Único status que recusa o vínculo é RECEBIDA: a OC já foi processada por
 * este caminho, então vincular de novo é o cenário de duplicidade real
 * identificado na investigação S8. Qualquer outro status (inclusive
 * RASCUNHO/CANCELADA, fora da lista elegível listada pelo backend) não é
 * bloqueado aqui — a lista de OCs oferecida ao operador (PR2) já se limita a
 * CONFIRMADA/EM_TRANSITO, então esta função só precisa cobrir o caso em que o
 * vínculo enviado não é mais válido no momento do submit.
 */
export function validarVinculoOrdemCompra(status: StatusOC): string | null {
  if (status === 'RECEBIDA') {
    return 'Esta ordem de compra já foi recebida. Prossiga sem vínculo se este for um recebimento diferente.'
  }
  return null
}

export function validarRemessaInput(input: {
  origem: string
  itens: Array<{ produto_id: string; quantidade_esperada: number; quantidade_conferida: number }>
}): string | null {
  const origem = input.origem.trim()
  if (!origem) return 'Informe a origem da remessa.'
  if (!input.itens?.length) return 'Inclua ao menos um item.'
  for (const it of input.itens) {
    if (!it.produto_id?.trim()) return 'Produto inválido na remessa.'
    if (!Number.isFinite(it.quantidade_esperada) || it.quantidade_esperada < 0) {
      return 'Quantidade esperada inválida.'
    }
    if (it.quantidade_esperada === 0) {
      return 'Quantidade esperada deve ser maior que zero.'
    }
    if (!Number.isFinite(it.quantidade_conferida) || it.quantidade_conferida < 0) {
      return 'Quantidade conferida inválida.'
    }
    if (it.quantidade_conferida === 0) {
      return 'Quantidade conferida deve ser maior que zero para confirmar a entrada.'
    }
  }
  return null
}
