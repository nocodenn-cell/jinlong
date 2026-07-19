/**
 * Policy pura de exclusão/inativação de produto.
 * Espelha `motivoBloqueioExclusaoFisica` + lote em gerente/produtos (sem I/O).
 *
 * Evidência: pdv-importados/lib/gerente/produtoExclusaoLote.ts
 * + aplicarExclusaoOuInativacaoEmLote (actions).
 *
 * Saldo atual de estoque NÃO bloqueia delete físico — só referências
 * operacionais (itens_venda, remessa, kardex, reposições).
 */

import type {
  ProductExclusionDecision,
  ProductExclusionFacts,
} from '../contracts'

/** True se qualquer FK / trilha de auditoria impede delete físico. */
export function produtoTemReferenciaOperacional(facts: ProductExclusionFacts): boolean {
  return (
    facts.temItensVenda ||
    facts.temRemessaItens ||
    facts.temMovimentosEstoque ||
    facts.temReposicoesCancelamento
  )
}

/**
 * Decide efeito sem I/O.
 *
 * Ordem legada:
 * 1. qualquer referência operacional → inactivate (já inativo = no-op no efeito)
 * 2. senão → delete físico
 *
 * `temSaldoEstoque` é fato investigado na borda — **não** entra na decisão
 * (delete físico remove linha órfã de `estoque` quando limpo).
 */
export function decideProductExclusion(
  facts: ProductExclusionFacts,
): ProductExclusionDecision {
  if (produtoTemReferenciaOperacional(facts)) {
    return {
      action: 'inactivate',
      alreadyInactive: facts.ativo !== true,
    }
  }
  return { action: 'delete' }
}
