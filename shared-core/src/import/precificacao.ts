/**
 * Simulação de preço de venda (varejo/atacado) a partir do custo unitário apurado.
 * PURA: não altera preços oficiais. Centavos HALF_UP; percentuais com até 4 casas.
 *   MARGEM  (sobre o preço):  preço = custo / (1 − margem − despesas_venda)
 *   MARKUP  (sobre o custo):  preço = custo × (1 + markup) / (1 − despesas_venda)
 */
import { divide, formataDecimal, multiplica, parseDecimal } from './decimal'

export type CanalVenda = 'VAREJO' | 'ATACADO'
export type ModoPreco = 'MARGEM' | 'MARKUP'

export interface CenarioPreco {
  readonly canal: CanalVenda
  readonly modo: ModoPreco
  readonly percentual: string
  /** Despesas variáveis de venda (impostos sobre venda, taxa de cartão…), % do preço. */
  readonly despesas_venda_pct?: string | null
}

export interface PrecoSimulado {
  readonly canal: CanalVenda
  readonly modo: ModoPreco
  readonly percentual: string
  readonly custo_unitario_brl: string
  readonly preco_brl: string
  readonly lucro_unitario_brl: string
  readonly margem_resultante_pct: string
  readonly markup_resultante_pct: string
}

export class PrecificacaoErro extends Error {}

export function simularPreco(custoUnitario: string, c: CenarioPreco): PrecoSimulado {
  const custo6 = parseDecimal(custoUnitario, 6)
  if (custo6 <= 0n) throw new PrecificacaoErro('CUSTO_INVALIDO')
  const p4 = parseDecimal(c.percentual, 4)
  const dv4 = c.despesas_venda_pct ? parseDecimal(c.despesas_venda_pct, 4) : 0n
  if (p4 < 0n || dv4 < 0n) throw new PrecificacaoErro('PERCENTUAL_INVALIDO')
  let preco2: bigint
  if (c.modo === 'MARGEM') {
    const resto4 = 1000000n - p4 - dv4 // (100 − m − dv) escala 4
    if (resto4 <= 0n) throw new PrecificacaoErro('MARGEM_IMPOSSIVEL')
    preco2 = divide(custo6 * 100n, 6, resto4, 4, 2)
  } else {
    const fator4 = 1000000n + p4 // (100 + markup) escala 4
    const bruto = divide(multiplica(custo6, 6, fator4, 4, 6), 6, 100n, 0, 6)
    preco2 = dv4 > 0n ? divide(bruto * 100n, 6, 1000000n - dv4, 4, 2) : divide(bruto, 6, 1n, 0, 2)
  }
  const custo2 = divide(custo6, 6, 1n, 0, 2)
  const lucro2 = preco2 - custo2
  return {
    canal: c.canal, modo: c.modo, percentual: c.percentual,
    custo_unitario_brl: formataDecimal(custo6, 6),
    preco_brl: formataDecimal(preco2, 2),
    lucro_unitario_brl: formataDecimal(lucro2, 2),
    margem_resultante_pct: formataDecimal(divide(lucro2 * 100n, 2, preco2, 2, 2), 2),
    markup_resultante_pct: formataDecimal(divide(lucro2 * 100n, 2, custo2, 2, 2), 2),
  }
}

export interface ComparacaoCusto {
  readonly item_id: string
  readonly estimado_brl: string | null
  readonly real_brl: string | null
  readonly variacao_brl: string | null
  readonly variacao_pct: string | null
}

/** Estimado (simulação antes da chegada) × real (apuração após desembaraço), por item. */
export function compararEstimadoReal(
  estimado: ReadonlyArray<{ item_id: string; custo_unitario_brl: string }>,
  real: ReadonlyArray<{ item_id: string; custo_unitario_brl: string }>,
): ComparacaoCusto[] {
  const mE = new Map(estimado.map((x) => [x.item_id, parseDecimal(x.custo_unitario_brl, 6)]))
  const mR = new Map(real.map((x) => [x.item_id, parseDecimal(x.custo_unitario_brl, 6)]))
  const ids = [...new Set([...mE.keys(), ...mR.keys()])]
  return ids.map((id) => {
    const e = mE.get(id), r = mR.get(id)
    const v = e !== undefined && r !== undefined ? r - e : null
    return {
      item_id: id,
      estimado_brl: e === undefined ? null : formataDecimal(e, 6),
      real_brl: r === undefined ? null : formataDecimal(r, 6),
      variacao_brl: v === null ? null : formataDecimal(v, 6),
      variacao_pct: v === null || !e ? null : formataDecimal(divide(v * 100n, 6, e, 6, 2), 2),
    }
  })
}
