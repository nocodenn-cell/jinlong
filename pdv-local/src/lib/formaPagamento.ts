/**
 * Formas de pagamento do PDV desktop (venda com UMA forma por cupom).
 * Os códigos são os mesmos do servidor (`vendas_pagamentos.forma_pagamento`) e já são
 * aceitos pela edge `sync-outbox` / `registrar_venda_com_itens` via `forma_pagamento` escalar.
 * Sem TEF/gateway: cartão e PIX são declarados pelo operador após a aprovação na maquininha/app.
 */
export const FORMAS_PAGAMENTO_DESKTOP = ['DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO'] as const
export type FormaPagamentoDesktop = (typeof FORMAS_PAGAMENTO_DESKTOP)[number]

/** Rótulos pt + zh (o desktop ainda não tem i18n; o par mantém o operador chinês orientado). */
export const ROTULO_FORMA_PAGAMENTO: Record<FormaPagamentoDesktop, { pt: string; zh: string }> = {
  DINHEIRO: { pt: 'Dinheiro', zh: '现金' },
  PIX: { pt: 'PIX', zh: 'PIX' },
  CARTAO_CREDITO: { pt: 'Crédito', zh: '信用卡' },
  CARTAO_DEBITO: { pt: 'Débito', zh: '借记卡' },
}

export function isFormaPagamentoDesktop(v: unknown): v is FormaPagamentoDesktop {
  return typeof v === 'string' && (FORMAS_PAGAMENTO_DESKTOP as readonly string[]).includes(v)
}

/**
 * Regra comercial do servidor (20260929130000_descontos_venda_exige_pagamento_dinheiro):
 * desconto de gerente só em venda 100% dinheiro. Validar antes de gravar evita um evento
 * de outbox que o servidor recusaria para sempre.
 */
export function descontoGerenteCompativel(forma: FormaPagamentoDesktop, descontoGerentePercentual: number): boolean {
  return !(descontoGerentePercentual > 0) || forma === 'DINHEIRO'
}
