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

export const MAX_PARCELAS_CREDITO = 24

/** Linha do pagamento combinado digitada pelo operador (valor em reais, como no restante do PDV). */
export type LinhaPagamentoDesktop = {
  formaPagamento: FormaPagamentoDesktop
  valor: number
  /** Só crédito; ausente/1 = à vista. */
  parcelas?: number
}

export type PagamentoOutbox = { forma_pagamento: FormaPagamentoDesktop; valor: number; parcelas?: number }

export type ResultadoPagamentos =
  | { ok: true; pagamentos: PagamentoOutbox[]; trocoCentavos: number }
  | { ok: false; erro: string }

const toCentavos = (v: number) => Math.round(v * 100)

/**
 * Normaliza o pagamento (forma única ou combinado) em CENTAVOS inteiros, no mesmo contrato do servidor:
 * - soma enviada == total (o troco sai do dinheiro, nunca de cartão/PIX);
 * - excesso sem dinheiro suficiente = erro de digitação, não troco;
 * - falta de valor = erro (o desktop não vende a prazo);
 * - parcelas 1..24 só no crédito; uma linha por forma.
 */
export function normalizarPagamentos(linhas: readonly LinhaPagamentoDesktop[], totalLiquido: number): ResultadoPagamentos {
  const total = toCentavos(totalLiquido)
  if (!Number.isFinite(totalLiquido) || total <= 0) return { ok: false, erro: 'Total da venda inválido.' }
  if (linhas.length === 0) return { ok: false, erro: 'Informe ao menos uma forma de pagamento.' }
  const vistas = new Set<string>()
  const cents: Array<{ forma: FormaPagamentoDesktop; c: number; parcelas: number }> = []
  for (const l of linhas) {
    if (!isFormaPagamentoDesktop(l.formaPagamento)) return { ok: false, erro: 'Forma de pagamento inválida.' }
    if (vistas.has(l.formaPagamento)) return { ok: false, erro: 'Use cada forma de pagamento uma única vez.' }
    vistas.add(l.formaPagamento)
    if (!Number.isFinite(l.valor) || toCentavos(l.valor) <= 0) {
      return { ok: false, erro: 'Cada forma de pagamento precisa de um valor maior que zero.' }
    }
    const parcelas = l.parcelas ?? 1
    if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS_CREDITO
      || (parcelas > 1 && l.formaPagamento !== 'CARTAO_CREDITO')) {
      return { ok: false, erro: 'Parcelas só no crédito, de 1 a 24.' }
    }
    cents.push({ forma: l.formaPagamento, c: toCentavos(l.valor), parcelas })
  }
  const soma = cents.reduce((a, x) => a + x.c, 0)
  if (soma < total) return { ok: false, erro: 'Valor pago menor que o total da venda.' }
  const excesso = soma - total
  if (excesso > 0) {
    const din = cents.find((x) => x.forma === 'DINHEIRO')
    if (!din || din.c < excesso) {
      return { ok: false, erro: 'Valor acima do total em cartão/PIX. Troco só existe em dinheiro: corrija os valores.' }
    }
    din.c -= excesso
  }
  const pagamentos = cents
    .filter((x) => x.c > 0)
    .map((x) => ({
      forma_pagamento: x.forma,
      valor: x.c / 100,
      ...(x.parcelas > 1 ? { parcelas: x.parcelas } : {}),
    }))
  return { ok: true, pagamentos, trocoCentavos: excesso }
}
