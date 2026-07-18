/**
 * Helpers do estoque inicial no cadastro de produto (exceção SSoT fechada).
 * Sem novo fluxo de estoque — só intenção, feedback e mapeamento de erros RPC.
 */

export type EstoqueInicialIntent = {
  quantidade: number
  minimo: number
  /** Usuário pediu qty > 0 e/ou mínimo > 0. */
  deveAplicar: boolean
}

export function parseEstoqueInicialIntent(qtyRaw: string, minRaw: string): EstoqueInicialIntent {
  const quantidade = Number.parseInt(qtyRaw || '0', 10)
  const minimo = Number.parseInt(minRaw || '0', 10)
  const qtyOk = Number.isFinite(quantidade) && quantidade > 0
  const minOk = Number.isFinite(minimo) && minimo > 0
  return {
    quantidade: qtyOk ? quantidade : 0,
    minimo: minOk ? minimo : 0,
    deveAplicar: qtyOk || minOk,
  }
}

/** Códigos estáveis da RPC `ajustar_estoque_manual`. */
const AJUSTE_MSGS: Record<string, string> = {
  AJUSTE_ESTOQUE_AUTH: 'Sessão inválida para ajustar estoque. Faça login novamente.',
  AJUSTE_ESTOQUE_PERFIL:
    'Seu perfil não pode ajustar estoque. Use uma conta de gerente, dono ou administrador.',
  AJUSTE_ESTOQUE_LOJA_INVALIDA: 'A loja da sessão não coincide com a loja do estoque.',
  AJUSTE_ESTOQUE_QTD_INVALIDA: 'Quantidade de estoque inválida.',
  AJUSTE_ESTOQUE_MIN_INVALIDO: 'Estoque mínimo inválido.',
  AJUSTE_ESTOQUE_MOTIVO_INVALIDO: 'Motivo de ajuste de estoque inválido.',
  AJUSTE_ESTOQUE_OBSERVACAO_OBRIGATORIA: 'Informe uma observação para este ajuste.',
  AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA:
    'Linha de estoque não encontrada para este produto. Abra Estoque e tente novamente.',
}

export function mensagemErroAjusteEstoqueManual(detalhe: string): string {
  const raw = (detalhe ?? '').trim()
  if (!raw) return 'Não foi possível ajustar o estoque.'
  for (const code of Object.keys(AJUSTE_MSGS)) {
    if (raw.includes(code)) return AJUSTE_MSGS[code]!
  }
  return raw
}

export type FeedbackCadastroEstoque =
  | { kind: 'success_pleno' }
  | { kind: 'success_sem_estoque_pedido' }
  | { kind: 'produto_ok_estoque_falhou'; errorDetail: string | null }

/**
 * Decide o feedback pós-create. Nunca classifica como sucesso pleno se o
 * estoque inicial foi pedido e falhou.
 */
export function resolverFeedbackCadastroEstoque(opts: {
  estoquePedido: boolean
  estoqueOk: boolean
  estoqueErro: string | null
}): FeedbackCadastroEstoque {
  if (!opts.estoquePedido) return { kind: 'success_sem_estoque_pedido' }
  if (opts.estoqueOk) return { kind: 'success_pleno' }
  return { kind: 'produto_ok_estoque_falhou', errorDetail: opts.estoqueErro }
}
