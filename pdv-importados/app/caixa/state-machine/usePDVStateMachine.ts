"use client"

import { useCallback, useState, useRef } from "react"
import { PDVState, type PDVSaleContext, type PDVStateMachine, type PDVStateConfig } from "./pdvStateTypes"
import { getStateConfig } from "./pdvStateConfig"
import { canTransition, getAvailableTransitions } from "./pdvTransitions"

/**
 * Hook central da máquina de estados do PDV
 * Centraliza toda a lógica de fluxo, tornando os componentes simples renderizadores
 */
export function usePDVStateMachine(
  initialState: PDVState = PDVState.CAIXA_FECHADO,
  initialContext?: Partial<PDVSaleContext>,
): PDVStateMachine {
  const [currentState, setCurrentState] = useState<PDVState>(initialState)
  const [context, setContext] = useState<PDVSaleContext>({
    caixaId: null,
    caixaAberto: false,
    operadorId: initialContext?.operadorId ?? null,
    operadorLabel: initialContext?.operadorLabel ?? "Operador",
    cupomSessionId: initialContext?.cupomSessionId ?? generateUUID(),
    itens: [],
    totalBruto: 0,
    totalDesconto: 0,
    totalLiquido: 0,
    clienteSelecionado: null,
    descontoGerentePercentual: 0,
    gerenteToken: null,
    pagamentos: [],
    processando: false,
    erro: null,
    ...initialContext,
  })

  const stateConfig = getStateConfig(currentState)
  const transitionLogRef = useRef<Array<{ from: PDVState; to: PDVState; reason?: string; ts: number }>>([])

  const updateContext = useCallback((updates: Partial<PDVSaleContext>) => {
    setContext((prev) => ({ ...prev, ...updates }))
  }, [])

  const transition = useCallback(
    (toState: PDVState, reason?: string): boolean => {
      if (!canTransition(currentState, toState, context)) {
        console.warn(
          `[PDV StateMachine] Transição inválida: ${currentState} → ${toState}`,
          { context, reason },
        )
        return false
      }

      transitionLogRef.current.push({
        from: currentState,
        to: toState,
        reason,
        ts: Date.now(),
      })

      console.log(`[PDV StateMachine] ${currentState} → ${toState}${reason ? ` (${reason})` : ""}`)
      setCurrentState(toState)
      return true
    },
    [currentState, context],
  )

  const canTransitionTo = useCallback(
    (toState: PDVState): boolean => {
      return canTransition(currentState, toState, context)
    },
    [currentState, context],
  )

  const getStateDescription = useCallback((): string => {
    return stateConfig.description
  }, [stateConfig])

  /**
   * Ações de alto nível que disparam transições
   */
  const actions = {
    abrirCaixa: (caixaId: string) => {
      updateContext({ caixaId, caixaAberto: true })
      return transition(PDVState.CAIXA_ABERTO, "Caixa aberto")
    },

    fecharCaixa: () => {
      return transition(PDVState.CAIXA_FECHADO, "Caixa fechado")
    },

    novoCupom: () => {
      // Apenas orquestra transição — limpeza feita em CaixaPageClient (limparCarrinho, resetPagamentos, etc)
      if (currentState === PDVState.CAIXA_ABERTO || currentState === PDVState.VENDA_FINALIZADA) {
        return transition(PDVState.CUPOM_VAZIO, "Novo cupom")
      }
      return true
    },

    adicionarProduto: () => {
      // Apenas orquestra transição — carrinho e totais geridos pelo useCarrinhoStore
      if (currentState === PDVState.CUPOM_VAZIO) {
        return transition(PDVState.ADICIONANDO_ITENS, "Primeiro produto adicionado")
      }
      return true
    },

    removerProduto: (itensAtual: Array<any>) => {
      // Apenas orquestra transição — carrinho gerido pelo useCarrinhoStore
      if (itensAtual.length === 0) {
        return transition(PDVState.CUPOM_VAZIO, "Último item removido")
      }
      return true
    },

    selecionarCliente: (cliente: any) => {
      updateContext({ clienteSelecionado: cliente })
      if (currentState === PDVState.ADICIONANDO_ITENS) {
        return transition(PDVState.CLIENTE_SELECIONADO, "Cliente selecionado")
      }
      return true
    },

    trocarCliente: (novoCliente: any) => {
      updateContext({ clienteSelecionado: novoCliente })
      return true
    },

    pronto: () => {
      // Apenas orquestra transição — validação de carrinho feita em CaixaPageClient
      return transition(PDVState.PRONTO_PARA_PAGAMENTO, "Venda pronta para pagamento")
    },

    irParaPagamento: () => {
      return transition(PDVState.PAGAMENTO, "Iniciando pagamento")
    },

    voltarParaAdicionarItens: () => {
      return transition(PDVState.ADICIONANDO_ITENS, "Voltando para adicionar itens")
    },

    voltarParaCliente: () => {
      if (context.clienteSelecionado) {
        return transition(PDVState.CLIENTE_SELECIONADO, "Voltando para cliente")
      }
      return transition(PDVState.ADICIONANDO_ITENS, "Voltando para adicionar itens")
    },

    voltarDoPagamento: () => {
      return transition(PDVState.PRONTO_PARA_PAGAMENTO, "Voltando do pagamento")
    },

    cancelarCupom: () => {
      // Apenas orquestra transição — limpeza do carrinho feita em CaixaPageClient via limparCarrinho()
      return transition(PDVState.CUPOM_VAZIO, "Cupom cancelado")
    },

    receberPagamento: (pagamentos: any[]) => {
      updateContext({ pagamentos })
      return transition(PDVState.EMITINDO_DOCUMENTO, "Emitindo documento")
    },

    vendaFinalizada: (vendaId: string) => {
      updateContext({ ultimaAcao: `Venda ${vendaId} finalizada` })
      return transition(PDVState.VENDA_FINALIZADA, "Venda finalizada com sucesso")
    },

    // Modal actions
    abrirGerenteModal: () => {
      stateConfig.openModals.add("gerente")
      return true
    },

    fecharGerenteModal: () => {
      stateConfig.openModals.delete("gerente")
      return true
    },

    abrirMovimentacaoModal: (tipo: "suprimento" | "sangria") => {
      stateConfig.openModals.add("movimentacao")
      if (stateConfig.movimentacaoModalTipo !== undefined) {
        stateConfig.movimentacaoModalTipo = tipo
      }
      return true
    },

    fecharMovimentacaoModal: () => {
      stateConfig.openModals.delete("movimentacao")
      if (stateConfig.movimentacaoModalTipo !== undefined) {
        stateConfig.movimentacaoModalTipo = null
      }
      return true
    },

    abrirAcaoMovimentacao: (tipo: "cancelar" | "estornar", item: any) => {
      stateConfig.openModals.add("acaoMovimentacao")
      if (stateConfig.acaoMovimentacao !== undefined) {
        stateConfig.acaoMovimentacao = { tipo, item }
      }
      return true
    },

    fecharAcaoMovimentacao: () => {
      stateConfig.openModals.delete("acaoMovimentacao")
      if (stateConfig.acaoMovimentacao !== undefined) {
        stateConfig.acaoMovimentacao = null
      }
      return true
    },

    abrirValorNumericoModal: (fluxo: "abrir_caixa" | "fechar_contado", initial: string) => {
      stateConfig.openModals.add("valorNumerico")
      if (stateConfig.valorNumericoModal !== undefined) {
        stateConfig.valorNumericoModal = { fluxo, initial }
      }
      return true
    },

    fecharValorNumericoModal: () => {
      stateConfig.openModals.delete("valorNumerico")
      if (stateConfig.valorNumericoModal !== undefined) {
        stateConfig.valorNumericoModal = null
      }
      return true
    },

    abrirMotivoFecharModal: (tipo: "diferenca" | "blind_retry", valorContado: number, diferencaFmt?: string) => {
      stateConfig.openModals.add("motivo")
      if (stateConfig.motivoFecharModal !== undefined) {
        stateConfig.motivoFecharModal = { tipo, valorContado, diferencaFmt }
      }
      return true
    },

    fecharMotivoFecharModal: () => {
      stateConfig.openModals.delete("motivo")
      if (stateConfig.motivoFecharModal !== undefined) {
        stateConfig.motivoFecharModal = null
      }
      return true
    },

    abrirConfirmacao: (tipo: "sangria" | "cancelar" | "estornar", item?: any) => {
      stateConfig.openModals.add("confirmacao")
      if (stateConfig.confirmacaoPendente !== undefined) {
        stateConfig.confirmacaoPendente = { tipo, item }
      }
      return true
    },

    fecharConfirmacao: () => {
      stateConfig.openModals.delete("confirmacao")
      if (stateConfig.confirmacaoPendente !== undefined) {
        stateConfig.confirmacaoPendente = null
      }
      return true
    },

    abrirReciboModal: () => {
      stateConfig.openModals.add("recibo")
      return true
    },

    fecharReciboModal: () => {
      stateConfig.openModals.delete("recibo")
      return true
    },

    // UI state actions
    mudarAbaPdv: (aba: "produto" | "cliente" | "pgto") => {
      if (stateConfig.activeTab !== undefined) {
        stateConfig.activeTab = aba
      }
      return true
    },

    mudarMetodoPagamento: (metodo: "dinheiro" | "cartao" | "cheque" | "pix" | "crediario") => {
      if (stateConfig.metodoPagamento !== undefined) {
        stateConfig.metodoPagamento = metodo
      }
      return true
    },

    toggleSummaryCollapsed: () => {
      if (stateConfig.summaryCollapsed !== undefined) {
        stateConfig.summaryCollapsed = !stateConfig.summaryCollapsed
      }
      return true
    },
  }

  const stateMachine: PDVStateMachine = {
    currentState,
    context,
    stateConfig,
    canTransitionTo,
    transition,
    updateContext,
    getStateDescription,
  }

  return {
    ...stateMachine,
    ...actions,
  } as any
}

/**
 * Gera um UUID simples (não criptográfico)
 */
function generateUUID(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Hook auxiliar para obter ações disponíveis no estado atual
 */
export function usePDVAvailableActions(stateMachine: PDVStateMachine) {
  const config = stateMachine.stateConfig
  return {
    canAddProduct: config.allowedActions.adicionarProduto,
    canRemoveProduct: config.allowedActions.removerProduto,
    canSelectClient: config.allowedActions.selecionarCliente,
    canFinalize: config.allowedActions.finalizarVenda,
    canReceivePayment: config.allowedActions.receberPagamento,
    canOpenCash: config.allowedActions.abrirCaixa,
    canCloseCash: config.allowedActions.fecharCaixa,
  }
}

/**
 * Hook auxiliar para obter shortcuts disponíveis
 */
export function usePDVActiveShortcuts(stateMachine: PDVStateMachine) {
  const config = stateMachine.stateConfig
  return {
    shortcuts: Array.from(config.enabledShortcuts),
    autoFocus: config.autoFocus,
    defaultTab: config.defaultTab,
  }
}
