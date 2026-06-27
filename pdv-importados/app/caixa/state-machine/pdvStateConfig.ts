import { PDVState, type PDVStateConfig } from "./pdvStateTypes"

/**
 * Configuração de cada estado — define claramente o que é permitido
 */
export const pdvStateConfigs: Record<PDVState, PDVStateConfig> = {
  [PDVState.CAIXA_FECHADO]: {
    state: PDVState.CAIXA_FECHADO,
    visibleComponents: {
      busca: false,
      abaProduto: false,
      abaCliente: false,
      abaPagamento: false,
      carrinho: false,
      resumo: false,
    },
    enabledShortcuts: new Set(["F1"]), // Apenas ajuda
    autoFocus: "none",
    allowedActions: {
      adicionarProduto: false,
      removerProduto: false,
      selecionarCliente: false,
      finalizarVenda: false,
      receberPagamento: false,
      abrirCaixa: true,
      fecharCaixa: false,
    },
    description: "Caixa fechado — apenas abrir",
  },

  [PDVState.CAIXA_ABERTO]: {
    state: PDVState.CAIXA_ABERTO,
    visibleComponents: {
      busca: false,
      abaProduto: false,
      abaCliente: false,
      abaPagamento: false,
      carrinho: false,
      resumo: false,
    },
    enabledShortcuts: new Set(["F1"]),
    autoFocus: "none",
    allowedActions: {
      adicionarProduto: false,
      removerProduto: false,
      selecionarCliente: false,
      finalizarVenda: false,
      receberPagamento: false,
      abrirCaixa: false,
      fecharCaixa: true,
    },
    description: "Caixa aberto — aguardando novo cupom",
  },

  [PDVState.CUPOM_VAZIO]: {
    state: PDVState.CUPOM_VAZIO,
    visibleComponents: {
      busca: true,
      abaProduto: true,
      abaCliente: false, // Cliente só aparece se adicionado
      abaPagamento: false,
      carrinho: true,
      resumo: true,
    },
    enabledShortcuts: new Set(["F1", "F2", "F3", "F5", "ESC"]),
    autoFocus: "busca",
    defaultTab: "produto",
    allowedActions: {
      adicionarProduto: true,
      removerProduto: false, // Nada para remover ainda
      selecionarCliente: false, // Opcional, mas não aparece
      finalizarVenda: false, // Carrinho vazio
      receberPagamento: false,
      abrirCaixa: false,
      fecharCaixa: true,
    },
    description: "Cupom novo — pronto para adicionar produtos",
  },

  [PDVState.ADICIONANDO_ITENS]: {
    state: PDVState.ADICIONANDO_ITENS,
    visibleComponents: {
      busca: true,
      abaProduto: true,
      abaCliente: false, // Não visível por padrão
      abaPagamento: false,
      carrinho: true,
      resumo: true,
    },
    enabledShortcuts: new Set([
      "F1", // Ajuda
      "F2", // Cliente
      "F3", // Buscar
      "F5", // Remover item
      "F6", // Quantidade
      "F7", // Desconto (se gerente)
      "F8", // Preço (se gerente)
      "F9", // Finalizar
      "BACKSPACE", // Desfazer última remoção
      "ESC", // Cancelar cupom
      "ENTER", // Adicionar produto
    ]),
    autoFocus: "busca",
    defaultTab: "produto",
    allowedActions: {
      adicionarProduto: true,
      removerProduto: true,
      selecionarCliente: true,
      finalizarVenda: true,
      receberPagamento: false,
      abrirCaixa: false,
      fecharCaixa: true,
    },
    description: "Adicionando itens — operador trabalha aqui",
  },

  [PDVState.CLIENTE_SELECIONADO]: {
    state: PDVState.CLIENTE_SELECIONADO,
    visibleComponents: {
      busca: true,
      abaProduto: true,
      abaCliente: true, // Cliente agora visível
      abaPagamento: false,
      carrinho: true,
      resumo: true,
    },
    enabledShortcuts: new Set([
      "F1",
      "F2", // Trocar cliente
      "F3",
      "F5",
      "F6",
      "F7",
      "F8",
      "F9",
      "BACKSPACE",
      "ESC",
      "ENTER",
    ]),
    autoFocus: "busca",
    defaultTab: "cliente",
    allowedActions: {
      adicionarProduto: true,
      removerProduto: true,
      selecionarCliente: true, // Pode trocar
      finalizarVenda: true,
      receberPagamento: false,
      abrirCaixa: false,
      fecharCaixa: true,
    },
    description: "Cliente selecionado — pode voltar a adicionar itens",
  },

  [PDVState.PRONTO_PARA_PAGAMENTO]: {
    state: PDVState.PRONTO_PARA_PAGAMENTO,
    visibleComponents: {
      busca: false, // Busca desaparece
      abaProduto: true,
      abaCliente: true,
      abaPagamento: false, // Não é aba ainda
      carrinho: true,
      resumo: true,
    },
    enabledShortcuts: new Set([
      "F1",
      "F2", // Voltar para cliente (editar)
      "F3", // Voltar para produtos (editar)
      "F4", // Confirmar pagamento
      "ESC", // Cancelar
    ]),
    autoFocus: "none",
    defaultTab: "produto",
    allowedActions: {
      adicionarProduto: false,
      removerProduto: false,
      selecionarCliente: true, // Pode voltar
      finalizarVenda: false,
      receberPagamento: true,
      abrirCaixa: false,
      fecharCaixa: false,
    },
    description: "Pronto para pagamento — aguardando confirmação",
  },

  [PDVState.PAGAMENTO]: {
    state: PDVState.PAGAMENTO,
    visibleComponents: {
      busca: false,
      abaProduto: false,
      abaCliente: false,
      abaPagamento: true, // Tela inteira de pagamento
      carrinho: false,
      resumo: false,
    },
    enabledShortcuts: new Set([
      "F1", // Ajuda
      "F4", // PIX
      "F5", // Dinheiro
      "F6", // Crédito
      "F7", // Débito
      "TAB", // Navegar entre formas
      "ENTER", // Confirmar
      "ESC", // Voltar
    ]),
    autoFocus: "valorRecebido",
    defaultTab: "pgto",
    allowedActions: {
      adicionarProduto: false,
      removerProduto: false,
      selecionarCliente: false,
      finalizarVenda: false,
      receberPagamento: true,
      abrirCaixa: false,
      fecharCaixa: false,
    },
    description: "Pagamento — tela inteira focada em receber",
  },

  [PDVState.EMITINDO_DOCUMENTO]: {
    state: PDVState.EMITINDO_DOCUMENTO,
    visibleComponents: {
      busca: false,
      abaProduto: false,
      abaCliente: false,
      abaPagamento: true,
      carrinho: false,
      resumo: false,
    },
    enabledShortcuts: new Set(["F1"]), // Apenas ajuda
    autoFocus: "none",
    allowedActions: {
      adicionarProduto: false,
      removerProduto: false,
      selecionarCliente: false,
      finalizarVenda: false,
      receberPagamento: false,
      abrirCaixa: false,
      fecharCaixa: false,
    },
    description: "Emitindo documento — processando venda",
  },

  [PDVState.VENDA_FINALIZADA]: {
    state: PDVState.VENDA_FINALIZADA,
    visibleComponents: {
      busca: false,
      abaProduto: false,
      abaCliente: false,
      abaPagamento: true,
      carrinho: false,
      resumo: false,
    },
    enabledShortcuts: new Set([
      "F1", // Ajuda
      "F8", // Reimprimir
      "F9", // Novo cupom
      "ESC", // Novo cupom
    ]),
    autoFocus: "none",
    allowedActions: {
      adicionarProduto: false,
      removerProduto: false,
      selecionarCliente: false,
      finalizarVenda: false,
      receberPagamento: false,
      abrirCaixa: false,
      fecharCaixa: true,
    },
    description: "Venda finalizada — sucesso!",
  },
}

export function getStateConfig(state: PDVState): PDVStateConfig {
  return pdvStateConfigs[state]
}
