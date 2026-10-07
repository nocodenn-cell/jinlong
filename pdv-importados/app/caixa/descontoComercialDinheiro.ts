/**
 * Desconto comercial no pagamento em dinheiro (até 10% do subtotal).
 * O operador aplica sem token de gerente quando o cupom é 100% DINHEIRO.
 * Acima de 10% continua exigindo autorização de gerente.
 */
export const DESCONTO_COMERCIAL_DINHEIRO_MAX_PCT = 10

export type DescontoComercialDinheiroInput = {
  subtotal: number
  modo: 'percentual' | 'valor'
  valor: number
}

export type DescontoComercialDinheiroResult = {
  ok: boolean
  percentual: number
  descontoValor: number
  totalFinal: number
  motivo?: 'SUBTOTAL_INVALIDO' | 'VALOR_INVALIDO' | 'ACIMA_DO_LIMITE'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calcularDescontoComercialDinheiro(
  input: DescontoComercialDinheiroInput,
  maxPct = DESCONTO_COMERCIAL_DINHEIRO_MAX_PCT,
): DescontoComercialDinheiroResult {
  const subtotal = Number.isFinite(input.subtotal) ? input.subtotal : NaN
  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    return { ok: false, percentual: 0, descontoValor: 0, totalFinal: 0, motivo: 'SUBTOTAL_INVALIDO' }
  }
  const raw = Number.isFinite(input.valor) ? input.valor : NaN
  if (!Number.isFinite(raw) || raw < 0) {
    return { ok: false, percentual: 0, descontoValor: 0, totalFinal: subtotal, motivo: 'VALOR_INVALIDO' }
  }
  const descontoValor = input.modo === 'percentual'
    ? round2(subtotal * raw / 100)
    : round2(raw)
  const percentual = subtotal > 0 ? round2((descontoValor / subtotal) * 100) : 0
  if (percentual > maxPct + 0.005 || descontoValor > round2(subtotal * maxPct / 100) + 0.005) {
    return { ok: false, percentual, descontoValor, totalFinal: round2(subtotal - descontoValor), motivo: 'ACIMA_DO_LIMITE' }
  }
  const capped = Math.min(descontoValor, subtotal)
  return {
    ok: true,
    percentual: subtotal > 0 ? round2((capped / subtotal) * 100) : 0,
    descontoValor: capped,
    totalFinal: round2(subtotal - capped),
  }
}

/** Contrato servidor/UI: comercial do operador ≤10%, sem token, motivo AUTORIZACAO_COMERCIAL. */
export function isDescontoComercialOperador(input: {
  token?: string | null
  percentual?: number | null
  motivo?: string | null
}): boolean {
  if (input.token) return false
  const pct = input.percentual
  if (pct == null || !Number.isFinite(pct) || pct <= 0 || pct > DESCONTO_COMERCIAL_DINHEIRO_MAX_PCT) return false
  return input.motivo === 'AUTORIZACAO_COMERCIAL'
}
