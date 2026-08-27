import { roundMoney2 } from '@/shared/cart/totals'

/** Limiar de saldo a receber — alinhado à RPC v4 / Fase 5b (`> 0.009`). */
export const SALDO_PENDENTE_EPS = 0.009

/** Limiar de troco / excesso de pagamento (Zod + UI). */
export const EXCESSO_PAGAMENTO_EPS = 0.01

export type ResumoParcelas = {
  somaParcelas: number
  diferenca: number
  saldoPendente: number
}

/** Totais do painel de parcelas (Web caixa). */
export function calcularResumoParcelas(
  totalLiquido: number,
  somaParcelasRaw: number,
): ResumoParcelas {
  const somaParcelas = roundMoney2(somaParcelasRaw)
  const total = roundMoney2(totalLiquido)
  return {
    somaParcelas,
    diferenca: roundMoney2(somaParcelas - total),
    saldoPendente: roundMoney2(total - somaParcelas),
  }
}

/** Pagamento parcial (crédito) exige cliente da loja. */
export function pagamentoParcialExigeCliente(
  saldoPendente: number,
  clienteId: string | null | undefined,
): boolean {
  return saldoPendente > SALDO_PENDENTE_EPS && !clienteId
}

export type ResultadoTroco = {
  /** Total líquido da venda (arredondado a 2 casas). */
  total: number
  /** Valor recebido em dinheiro (arredondado a 2 casas, nunca negativo). */
  recebido: number
  /** Troco a devolver = max(0, recebido − total). */
  troco: number
  /** Saldo ainda a receber = max(0, total − recebido). */
  saldoPendente: number
  /** true quando o recebido cobre o total (dentro do epsilon de saldo). */
  suficiente: boolean
}

/**
 * Cálculo canônico de troco para pagamento em dinheiro (display-only — a venda
 * continua sendo autorizada pela RPC v4, que revalida os valores). Fonte única
 * para o campo "Recebido/Troco" inline do caixa e para qualquer resumo de troco,
 * evitando reimplementar a subtração em cada componente.
 */
export function calcularTroco(total: number, recebido: number): ResultadoTroco {
  const t = roundMoney2(Math.max(0, total))
  const r = roundMoney2(Math.max(0, recebido))
  return {
    total: t,
    recebido: r,
    troco: roundMoney2(Math.max(0, r - t)),
    saldoPendente: roundMoney2(Math.max(0, t - r)),
    suficiente: roundMoney2(t - r) <= SALDO_PENDENTE_EPS,
  }
}

export type AvaliacaoExcessoParcelas = {
  /** Índice da última parcela DINHEIRO em `pagamentos`, ou -1 se não há nenhuma. */
  idxDinheiro: number
  /** Valor disponível nessa parcela para virar troco (0 se não há parcela DINHEIRO). */
  dinheiroDisponivel: number
  /** true quando o excesso cabe inteiro no dinheiro recebido — pode virar troco. */
  trocoValido: boolean
}

/**
 * Troco só existe em dinheiro: o excesso de uma divisão de pagamento só pode
 * ser abatido do valor realmente recebido em espécie, nunca de uma parcela
 * cartão/PIX. Abater de cartão/PIX subregistraria em silêncio o valor
 * cobrado na maquininha frente ao que o operador de fato passou — e, se o
 * excesso for maior que o dinheiro recebido, o problema é o valor digitado
 * em alguma parcela, não troco a devolver.
 */
export function avaliarExcessoParcelas(
  pagamentos: ReadonlyArray<{ formaPagamento: string; valor: number }>,
  excesso: number,
): AvaliacaoExcessoParcelas {
  let idxDinheiro = -1
  for (let i = pagamentos.length - 1; i >= 0; i--) {
    if (pagamentos[i].formaPagamento === 'DINHEIRO') {
      idxDinheiro = i
      break
    }
  }
  const dinheiroDisponivel = idxDinheiro >= 0 ? roundMoney2(pagamentos[idxDinheiro].valor) : 0
  return {
    idxDinheiro,
    dinheiroDisponivel,
    trocoValido: excesso > 0 && roundMoney2(dinheiroDisponivel - excesso) >= -EXCESSO_PAGAMENTO_EPS,
  }
}
