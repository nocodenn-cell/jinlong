/**
 * Decisão pura: o que fazer com o cupom (carrinho) persistido no navegador ao
 * abrir o PDV. Não toca no store nem no servidor — o chamador aplica a decisão.
 *
 * Princípios:
 * - O carrinho local é só rascunho. Vendas em espera (`colocar_venda_em_espera`,
 *   `retomar_…`, `devolver_…`) vivem no servidor e NÃO são decididas aqui; a única
 *   coisa que este módulo faz com a espera é devolver o claim de um cupom descartado.
 * - Finalização pendente nunca é descartada em silêncio: a chave de idempotência é
 *   consultada no servidor (`verificar_finalizacao`) antes de qualquer desfecho.
 * - Nenhum valor recebido/pagamento é lido do armazenamento: esse estado não é persistido.
 * - Só se decide com o contexto do caixa definitivo (aberto ou fechado).
 */

/** Versão do formato persistido. v1 não tinha caixaId/atualizadoEm: é descartado. */
export const CARRINHO_PERSIST_VERSION = 2

/** Cupom sem atividade por mais que isto não é retomado automaticamente. */
export const CARRINHO_VALIDADE_MS = 12 * 60 * 60 * 1000

export type MotivoDescarteCarrinho =
  | 'sem_dono'
  | 'outro_operador'
  | 'caixa_fechado'
  | 'outro_turno'
  | 'outra_loja'
  | 'expirado'

export type ContextoCaixaRecuperacao =
  | { status: 'carregando' }
  | { status: 'erro' }
  | { status: 'fechado' }
  | { status: 'aberto'; caixaId: string }

export type CarrinhoPersistidoRecuperacao = {
  itens: readonly unknown[]
  cartOwnerUserId: string | null
  cartLojaId: string | null
  caixaId: string | null
  atualizadoEm: string | null
  vendaFinalizacaoPendente: boolean
  vendaIdempotencyKey: string | null
  vendaEmEsperaOrigemId: string | null
}

export type DecisaoRecuperacaoCarrinho =
  | { acao: 'aguardar' }
  | { acao: 'restaurar' }
  | { acao: 'verificar_finalizacao' }
  | { acao: 'vazio'; devolverEsperaId: string | null }
  | { acao: 'descartar'; motivo: MotivoDescarteCarrinho; devolverEsperaId: string | null }

export type OpcoesRecuperacaoCarrinho = {
  /** Operador autenticado agora (auth uid). `null` = sem sessão. */
  userId: string | null
  /** Loja do PDV agora, quando conhecida. */
  lojaId?: string | null
  caixa: ContextoCaixaRecuperacao
  /** Instante atual em epoch ms (injetado para teste). */
  agora: number
}

export function decidirRecuperacaoCarrinho(
  persistido: CarrinhoPersistidoRecuperacao,
  opcoes: OpcoesRecuperacaoCarrinho,
): DecisaoRecuperacaoCarrinho {
  // Sem contexto definitivo do caixa não há como decidir: nada é restaurado nem descartado.
  if (opcoes.caixa.status === 'carregando' || opcoes.caixa.status === 'erro') {
    return { acao: 'aguardar' }
  }

  const temItens = persistido.itens.length > 0
  const origem = persistido.vendaEmEsperaOrigemId

  // Finalização possivelmente gravada no servidor: vai ao modal de verificação pela chave.
  if (persistido.vendaFinalizacaoPendente) {
    return { acao: 'verificar_finalizacao' }
  }

  if (!temItens) {
    return { acao: 'vazio', devolverEsperaId: origem }
  }

  const descartar = (motivo: MotivoDescarteCarrinho): DecisaoRecuperacaoCarrinho => ({
    acao: 'descartar',
    motivo,
    devolverEsperaId: origem,
  })

  if (!persistido.cartOwnerUserId) return descartar('sem_dono')
  if (persistido.cartOwnerUserId !== opcoes.userId) return descartar('outro_operador')

  if (opcoes.caixa.status === 'fechado') return descartar('caixa_fechado')
  if (!persistido.caixaId || persistido.caixaId !== opcoes.caixa.caixaId) {
    return descartar('outro_turno')
  }

  if (opcoes.lojaId && persistido.cartLojaId && persistido.cartLojaId !== opcoes.lojaId) {
    return descartar('outra_loja')
  }

  const ultimaAtividade = persistido.atualizadoEm ? Date.parse(persistido.atualizadoEm) : Number.NaN
  if (!Number.isFinite(ultimaAtividade) || opcoes.agora - ultimaAtividade > CARRINHO_VALIDADE_MS) {
    return descartar('expirado')
  }

  return { acao: 'restaurar' }
}
