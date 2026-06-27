import { PDVState, type PDVStateTransition, type PDVSaleContext } from "./pdvStateTypes"

/**
 * Definição de transições válidas entre estados
 * Cada transição pode ter uma condição (guard) que valida se a transição é possível
 */
export const pdvTransitions: PDVStateTransition[] = [
  // Abertura do caixa
  {
    from: PDVState.CAIXA_FECHADO,
    to: PDVState.CAIXA_ABERTO,
    trigger: "abrirCaixa",
    condition: (ctx) => !!ctx.operadorId,
  },

  // Fechamento do caixa
  {
    from: PDVState.CAIXA_ABERTO,
    to: PDVState.CAIXA_FECHADO,
    trigger: "fecharCaixa",
  },

  // Novo cupom (do CAIXA_ABERTO direto para CUPOM_VAZIO)
  {
    from: PDVState.CAIXA_ABERTO,
    to: PDVState.CUPOM_VAZIO,
    trigger: "novoCupom",
  },

  // Adicionar primeiro produto (CUPOM_VAZIO → ADICIONANDO_ITENS)
  {
    from: PDVState.CUPOM_VAZIO,
    to: PDVState.ADICIONANDO_ITENS,
    trigger: "adicionarProduto",
    condition: (ctx) => ctx.itens.length > 0,
  },

  // Selecionar cliente (pode estar em ADICIONANDO_ITENS ou CUPOM_VAZIO)
  {
    from: PDVState.ADICIONANDO_ITENS,
    to: PDVState.CLIENTE_SELECIONADO,
    trigger: "selecionarCliente",
    condition: (ctx) => !!ctx.clienteSelecionado,
  },

  // Voltar de CLIENTE_SELECIONADO para ADICIONANDO_ITENS
  {
    from: PDVState.CLIENTE_SELECIONADO,
    to: PDVState.ADICIONANDO_ITENS,
    trigger: "trocarCliente",
    condition: (ctx) => ctx.itens.length > 0,
  },

  // Adicionar mais produtos (permanecer em ADICIONANDO_ITENS)
  {
    from: PDVState.CLIENTE_SELECIONADO,
    to: PDVState.CLIENTE_SELECIONADO,
    trigger: "adicionarProduto",
  },

  // Finalizar venda (pronto para pagamento)
  {
    from: PDVState.ADICIONANDO_ITENS,
    to: PDVState.PRONTO_PARA_PAGAMENTO,
    trigger: "pronto",
    condition: (ctx) => ctx.itens.length > 0 && ctx.totalLiquido > 0,
  },

  {
    from: PDVState.CLIENTE_SELECIONADO,
    to: PDVState.PRONTO_PARA_PAGAMENTO,
    trigger: "pronto",
    condition: (ctx) => ctx.itens.length > 0 && ctx.totalLiquido > 0,
  },

  // Voltar de PRONTO_PARA_PAGAMENTO para editar
  {
    from: PDVState.PRONTO_PARA_PAGAMENTO,
    to: PDVState.ADICIONANDO_ITENS,
    trigger: "voltarParaAdicionarItens",
  },

  {
    from: PDVState.PRONTO_PARA_PAGAMENTO,
    to: PDVState.CLIENTE_SELECIONADO,
    trigger: "voltarParaCliente",
    condition: (ctx) => !!ctx.clienteSelecionado,
  },

  // Ir para pagamento (tela inteira)
  {
    from: PDVState.PRONTO_PARA_PAGAMENTO,
    to: PDVState.PAGAMENTO,
    trigger: "irParaPagamento",
  },

  // Emitindo documento
  {
    from: PDVState.PAGAMENTO,
    to: PDVState.EMITINDO_DOCUMENTO,
    trigger: "emitindo",
    condition: (ctx) => ctx.pagamentos.length > 0,
  },

  // Venda finalizada com sucesso
  {
    from: PDVState.EMITINDO_DOCUMENTO,
    to: PDVState.VENDA_FINALIZADA,
    trigger: "vendaFinalizada",
  },

  // Novo cupom (volta para CUPOM_VAZIO após finalizar)
  {
    from: PDVState.VENDA_FINALIZADA,
    to: PDVState.CUPOM_VAZIO,
    trigger: "novoCupom",
  },

  // Cancelar cupom (de qualquer estado com itens volta para CUPOM_VAZIO)
  {
    from: PDVState.ADICIONANDO_ITENS,
    to: PDVState.CUPOM_VAZIO,
    trigger: "cancelarCupom",
  },

  {
    from: PDVState.CLIENTE_SELECIONADO,
    to: PDVState.CUPOM_VAZIO,
    trigger: "cancelarCupom",
  },

  // Remover último item (se em ADICIONANDO_ITENS e ficar vazio)
  {
    from: PDVState.ADICIONANDO_ITENS,
    to: PDVState.CUPOM_VAZIO,
    trigger: "removerUltimoItem",
    condition: (ctx) => ctx.itens.length === 0,
  },

  {
    from: PDVState.CLIENTE_SELECIONADO,
    to: PDVState.CUPOM_VAZIO,
    trigger: "removerUltimoItem",
    condition: (ctx) => ctx.itens.length === 0,
  },

  // Voltar do pagamento
  {
    from: PDVState.PAGAMENTO,
    to: PDVState.PRONTO_PARA_PAGAMENTO,
    trigger: "voltarDoPagamento",
  },
]

/**
 * Verifica se uma transição é válida
 */
export function canTransition(
  from: PDVState,
  to: PDVState,
  context: PDVSaleContext,
): boolean {
  const transition = pdvTransitions.find((t) => t.from === from && t.to === to)
  if (!transition) return false
  if (transition.condition && !transition.condition(context)) return false
  return true
}

/**
 * Encontra a transição entre dois estados
 */
export function findTransition(
  from: PDVState,
  to: PDVState,
): PDVStateTransition | undefined {
  return pdvTransitions.find((t) => t.from === from && t.to === to)
}

/**
 * Lista todas as transições possíveis de um estado
 */
export function getAvailableTransitions(
  from: PDVState,
  context: PDVSaleContext,
): PDVStateTransition[] {
  return pdvTransitions.filter(
    (t) => t.from === from && (!t.condition || t.condition(context)),
  )
}
