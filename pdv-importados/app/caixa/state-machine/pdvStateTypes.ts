/**
 * Máquina de estados para o PDV (Ponto de Venda)
 * Centraliza toda a lógica de fluxo, tornando os componentes simples renderizadores
 */

export enum PDVState {
  CAIXA_FECHADO = "CAIXA_FECHADO",
  CAIXA_ABERTO = "CAIXA_ABERTO",
  CUPOM_VAZIO = "CUPOM_VAZIO",
  ADICIONANDO_ITENS = "ADICIONANDO_ITENS",
  CLIENTE_SELECIONADO = "CLIENTE_SELECIONADO",
  PRONTO_PARA_PAGAMENTO = "PRONTO_PARA_PAGAMENTO",
  PAGAMENTO = "PAGAMENTO",
  EMITINDO_DOCUMENTO = "EMITINDO_DOCUMENTO",
  VENDA_FINALIZADA = "VENDA_FINALIZADA",
}

/**
 * Contexto da venda — dados que persist entre estados
 */
export type PDVSaleContext = {
  caixaId: string | null
  caixaAberto: boolean
  operadorId: string | null
  operadorLabel: string
  cupomSessionId: string
  itens: Array<any>
  totalBruto: number
  totalDesconto: number
  totalLiquido: number
  clienteSelecionado: any | null
  descontoGerentePercentual: number
  gerenteToken: string | null
  pagamentos: Array<any>
  processando: boolean
  erro: string | null
  ultimaAcao?: string
}

/**
 * Configuração de cada estado — o que é permitido
 */
export type PDVStateConfig = {
  state: PDVState
  /** Componentes/abas visíveis neste estado */
  visibleComponents: {
    busca: boolean
    abaProduto: boolean
    abaCliente: boolean
    abaPagamento: boolean
    carrinho: boolean
    resumo: boolean
  }
  /** Atalhos ativos neste estado (F2, F3, etc) */
  enabledShortcuts: Set<string>
  /** Qual componente recebe foco automaticamente */
  autoFocus?: "busca" | "cliente" | "valorRecebido" | "none"
  /** Qual aba está visível por padrão */
  defaultTab?: "produto" | "cliente" | "pgto"
  /** Qual aba está ativa neste estado */
  activeTab?: "produto" | "cliente" | "pgto"
  /** Ações permitidas */
  allowedActions: {
    adicionarProduto: boolean
    removerProduto: boolean
    selecionarCliente: boolean
    finalizarVenda: boolean
    receberPagamento: boolean
    abrirCaixa: boolean
    fecharCaixa: boolean
  }
  /** Quais modais estão abertos neste estado */
  openModals: Set<"gerente" | "movimentacao" | "acaoMovimentacao" | "valorNumerico" | "motivo" | "confirmacao" | "recibo">
  /** Qual tipo de movimentação modal está aberto (se algum) */
  movimentacaoModalTipo?: "suprimento" | "sangria" | null
  /** Qual ação de movimentação está pendente (se alguma) */
  acaoMovimentacao?: { tipo: "cancelar" | "estornar"; item: any } | null
  /** Estado do modal de valor numérico */
  valorNumericoModal?: { fluxo: "abrir_caixa" | "fechar_contado"; initial: string } | null
  /** Estado do modal de motivo de fechamento */
  motivoFecharModal?: { tipo: "diferenca" | "blind_retry"; valorContado: number; diferencaFmt?: string } | null
  /** Confirmação pendente */
  confirmacaoPendente?: { tipo: "sangria" | "cancelar" | "estornar"; item?: any } | null
  /** Se o resumo financeiro está colapsado */
  summaryCollapsed?: boolean
  /** Método de pagamento selecionado */
  metodoPagamento?: "dinheiro" | "cartao" | "cheque" | "pix" | "crediario"
  /** Descrição para debug */
  description: string
}

/**
 * Transição entre estados — o que pode acontecer em cada estado
 */
export type PDVStateTransition = {
  from: PDVState
  to: PDVState
  trigger: string
  condition?: (context: PDVSaleContext) => boolean
}

/**
 * Máquina de estados configurada
 */
export type PDVStateMachine = {
  currentState: PDVState
  context: PDVSaleContext
  stateConfig: PDVStateConfig
  canTransitionTo: (toState: PDVState) => boolean
  transition: (toState: PDVState, reason?: string) => boolean
  updateContext: (updates: Partial<PDVSaleContext>) => void
  getStateDescription: () => string
}
