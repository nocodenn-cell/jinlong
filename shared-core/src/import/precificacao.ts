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
  /** Margem BRUTA sobre `preco_brl` (antes das despesas de venda e de qualquer arredondamento). */
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
  const r = resultadoSobrePreco(custo6, preco2, dv4)
  return {
    canal: c.canal, modo: c.modo, percentual: c.percentual,
    custo_unitario_brl: formataDecimal(custo6, 6),
    preco_brl: formataDecimal(preco2, 2),
    lucro_unitario_brl: r.lucro, margem_resultante_pct: r.margem, markup_resultante_pct: r.markup,
  }
}

/**
 * Lucro/margem/markup de um preço DADO (escala 2) sobre o custo (escala 6, levado a centavos).
 * Margem líquida = (lucro − despesas_venda × preço) / preço, sem arredondamento intermediário.
 */
function resultadoSobrePreco(custo6: bigint, preco2: bigint, dv4: bigint) {
  const custo2 = divide(custo6, 6, 1n, 0, 2)
  const lucro2 = preco2 - custo2
  return {
    lucro: formataDecimal(lucro2, 2),
    margem: formataDecimal(divide(lucro2 * 100n, 2, preco2, 2, 2), 2),
    markup: formataDecimal(divide(lucro2 * 100n, 2, custo2, 2, 2), 2),
    margemLiquida: formataDecimal(divide(lucro2 * 1000000n - preco2 * dv4, 6, preco2, 2, 2), 2), // % escala 6 ÷ preço
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

/** Arredondamento comercial do preço: para cima até o final de centavos escolhido. */
export type FinalPreco = 'NENHUM' | '90' | '99' | '00'

export function arredondarComercial(preco: string, final: FinalPreco): string {
  const c = parseDecimal(preco, 2)
  if (final === 'NENHUM') return formataDecimal(c, 2)
  const alvo = BigInt(final) // centavos finais desejados
  const inteiro = c / 100n
  let r = inteiro * 100n + alvo
  if (r < c) r += 100n
  return formataDecimal(r, 2)
}

export interface FaixaAtacado {
  /** Quantidade mínima (inteiro) para a faixa. */
  readonly quantidade_minima: number
  readonly modo: ModoPreco
  readonly percentual: string
}

/**
 * `margem_resultante_pct`/`markup_resultante_pct`/`lucro_unitario_brl` (herdados) são a margem-ALVO,
 * teórica, sobre `preco_brl` antes do arredondamento. Os campos `*_efetivo*` são recalculados
 * sobre `preco_arredondado_brl` — o preço que de fato será praticado.
 */
export interface PrecoFaixa extends PrecoSimulado {
  readonly quantidade_minima: number
  readonly preco_arredondado_brl: string
  readonly lucro_efetivo_brl: string
  /** Margem bruta sobre o preço arredondado (antes das despesas de venda). */
  readonly margem_efetiva_pct: string
  readonly markup_efetivo_pct: string
  /** Margem sobre o preço arredondado já descontadas as despesas variáveis de venda. */
  readonly margem_liquida_efetiva_pct: string
}

/**
 * Simulador de atacado por faixas de quantidade (ordenadas pela quantidade mínima), com
 * arredondamento comercial. Recusa faixas duplicadas ou com preço que SOBE com a quantidade.
 */
export function simularFaixasAtacado(
  custoUnitario: string, faixas: readonly FaixaAtacado[], final: FinalPreco = 'NENHUM', despesasVendaPct?: string | null,
): PrecoFaixa[] {
  const ord = [...faixas].sort((a, b) => a.quantidade_minima - b.quantidade_minima)
  const out: PrecoFaixa[] = []
  for (const f of ord) {
    if (!Number.isInteger(f.quantidade_minima) || f.quantidade_minima < 1) throw new PrecificacaoErro('FAIXA_INVALIDA')
    if (out.some((x) => x.quantidade_minima === f.quantidade_minima)) throw new PrecificacaoErro('FAIXA_DUPLICADA')
    const p = simularPreco(custoUnitario, { canal: 'ATACADO', modo: f.modo, percentual: f.percentual, despesas_venda_pct: despesasVendaPct })
    const arred = arredondarComercial(p.preco_brl, final)
    const ant = out[out.length - 1]
    if (ant && parseDecimal(arred, 2) > parseDecimal(ant.preco_arredondado_brl, 2)) throw new PrecificacaoErro('FAIXA_PRECO_CRESCENTE')
    // Entradas já validadas por simularPreco acima.
    const ef = resultadoSobrePreco(parseDecimal(custoUnitario, 6), parseDecimal(arred, 2), despesasVendaPct ? parseDecimal(despesasVendaPct, 4) : 0n)
    out.push({
      ...p, quantidade_minima: f.quantidade_minima, preco_arredondado_brl: arred,
      lucro_efetivo_brl: ef.lucro, margem_efetiva_pct: ef.margem, markup_efetivo_pct: ef.markup, margem_liquida_efetiva_pct: ef.margemLiquida,
    })
  }
  return out
}

/** Repreço sugerido: mantém a margem resultante do preço estimado sobre o custo real. */
export function repricoSugerido(precoEstimado: string, custoEstimado: string, custoReal: string): { preco_brl: string; margem_mantida_pct: string } {
  const pe = parseDecimal(precoEstimado, 2)
  const ce = divide(parseDecimal(custoEstimado, 6), 6, 1n, 0, 2)
  if (pe <= 0n) throw new PrecificacaoErro('PRECO_INVALIDO')
  const margem4 = divide((pe - ce) * 100n, 2, pe, 2, 4) // % escala 4
  const p = simularPreco(custoReal, { canal: 'VAREJO', modo: 'MARGEM', percentual: formataDecimal(margem4 < 0n ? 0n : margem4, 4) })
  return { preco_brl: p.preco_brl, margem_mantida_pct: formataDecimal(margem4, 4) }
}
