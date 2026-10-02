const MAPA: Record<string, string> = {
  DEVOLVER_VENDA_AUTH: 'Sessão expirada. Faça login novamente.',
  DEVOLVER_VENDA_IDEMPOTENCY_OBRIGATORIA: 'Chave de idempotência ausente.',
  DEVOLVER_VENDA_MOTIVO_OBRIGATORIO: 'Informe o motivo (mín. 2 caracteres).',
  DEVOLVER_VENDA_TIPO_INVALIDO: 'Tipo de operação inválido.',
  DEVOLVER_VENDA_FORMA_INVALIDA: 'Forma de estorno inválida.',
  DEVOLVER_VENDA_ITENS_OBRIGATORIOS: 'Selecione ao menos um item para devolver.',
  DEVOLVER_VENDA_NAO_ENCONTRADA: 'Venda não encontrada.',
  DEVOLVER_VENDA_STATUS_INVALIDO: 'Somente vendas concluídas podem ser devolvidas.',
  DEVOLVER_VENDA_CAIXA_NAO_ENCONTRADO: 'Caixa da venda não encontrado.',
  DEVOLVER_VENDA_SEM_PERMISSAO: 'Sem permissão para devolver vendas nesta loja.',
  DEVOLVER_VENDA_SUBSTITUTA_INVALIDA: 'Venda substituta inválida ou não concluída.',
  DEVOLVER_VENDA_ITEM_INVALIDO: 'Item ou quantidade inválidos.',
  DEVOLVER_VENDA_ITEM_NAO_PERTENCE: 'Item não pertence a esta venda.',
  DEVOLVER_VENDA_QTD_EXCEDE_VENDIDA: 'Quantidade devolvida excede o vendido.',
  DEVOLVER_VENDA_VALOR_DIVERGENTE: 'Valor de estorno diverge do total dos itens.',
  DEVOLVER_VENDA_VALOR_ZERO: 'Valor de estorno deve ser maior que zero.',
  DEVOLVER_VENDA_SEM_CONTA_RECEBER: 'Esta venda não possui conta a receber aberta.',
  DEVOLVER_VENDA_VALOR_EXCEDE_ABERTO: 'Valor excede o saldo em aberto do cliente.',
  DEVOLVER_VENDA_ESTOQUE_NAO_ENCONTRADO: 'Estoque do produto não encontrado na loja.',
  DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE: 'Saldo em dinheiro do caixa insuficiente para estorno.',
  // PR-2D — caixa pagador (regra 0/1/N) e conciliação D-13
  DEVOLVER_VENDA_SEM_CAIXA_ABERTO:
    'Não há caixa aberto para pagar a devolução em dinheiro. Abra um caixa ou escolha outra forma de estorno.',
  DEVOLVER_VENDA_CAIXA_OBRIGATORIO:
    'Há mais de um caixa aberto. Escolha o caixa que vai pagar a devolução em dinheiro.',
  DEVOLVER_VENDA_CAIXA_INVALIDO:
    'O caixa escolhido não está aberto ou não pertence a esta loja. Escolha outro caixa.',
  DEVOLVER_VENDA_RETRY_CAIXA_DIVERGENTE:
    'Esta devolução já foi registrada com outro caixa. Confira o comprovante antes de tentar de novo.',
  DEVOLVER_VENDA_TITULO_COM_LIQUIDACAO:
    'Esta venda tem pagamentos já recebidos no contas a receber. Estorne as liquidações em Financeiro (Contas a receber) e tente a devolução de novo.',
  DEVOLVER_VENDA_EXCEDE_VALOR_PAGO:
    'O valor devolvido excede o que o cliente efetivamente pagou e o saldo em aberto não cobre a diferença. Reduza a quantidade.',
}

export function mensagemErroDevolverVenda(codigoBruto: string): string {
  const codigo = codigoBruto.trim().toUpperCase()
  for (const [chave, msg] of Object.entries(MAPA)) {
    if (codigo.includes(chave)) return msg
  }
  return 'Não foi possível registrar a devolução. Tente novamente.'
}
