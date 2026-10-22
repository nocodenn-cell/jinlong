/**
 * Composição do VALOR ADUANEIRO (VA) por item — fonte canônica, pura, sem I/O.
 *
 * VA = FOB (mercadoria × câmbio) + frete internacional + seguro, em BRL.
 * Frete e seguro são repartidos entre os itens pelo critério FISCAL informado
 * (parâmetro explícito; DEFAULT 'VALOR_FOB', que preserva o comportamento atual).
 * ⚠ O critério fiscal de rateio está PENDENTE de validação (despachante/contador):
 * esta função não decide regra fiscal, só aplica o critério recebido.
 *
 * Contrato com o motor (I-09): `calcularLandedCost` NÃO calcula VA; lê
 * `valor_aduaneiro_brl` do item. Esta função serve para MOSTRAR a memória e
 * para PERSISTIR o VA por ação explícita do usuário — nunca para enriquecer a
 * entrada do motor em memória (quebraria o hash da apuração aprovada).
 *
 * Aritmética: decimal.ts (bigint, escala 6) e rateio EXATO de rateio.ts (maior
 * resto de Hamilton, desempate por id, conservação garantida). Isto SUBSTITUI o
 * antigo "trunca e entrega o resíduo ao último item" de inteligencia.ts: a
 * diferença é de no máximo poucas unidades na 6ª casa (micro-reais) por item;
 * no cenário real (câmbio 5,0277) é ±0,000001 em dois itens e zero em centavos.
 *
 * Sem câmbio para a moeda do item ⇒ item sem base (não inventa valor).
 */
import { divide, formataDecimal, multiplica, parseDecimal } from './decimal'
import { ratear } from './rateio'

/** Critério fiscal de rateio de frete/seguro na composição do VA. */
export type CriterioRateioVa = 'VALOR_FOB' | 'PESO_LIQUIDO' | 'PESO_BRUTO'

export interface ItemValorAduaneiro {
  readonly id: string
  readonly moeda: string
  readonly valor_mercadoria_moeda: string
  readonly peso_liquido_kg?: string | null
  readonly peso_bruto_kg?: string | null
}
export interface CambioValorAduaneiro { readonly moeda: string; readonly taxa: string }
export interface ValorEmMoeda { readonly moeda: string; readonly valor: string }

export interface EntradaValorAduaneiro {
  readonly itens: readonly ItemValorAduaneiro[]
  readonly cambios: readonly CambioValorAduaneiro[]
  /** Parcelas de frete internacional (já em BRL com moeda 'BRL', ou em moeda estrangeira). */
  readonly frete: readonly ValorEmMoeda[]
  readonly seguro: readonly ValorEmMoeda[]
  readonly criterio_frete?: CriterioRateioVa
  readonly criterio_seguro?: CriterioRateioVa
}

export interface ItemValorAduaneiroSaida {
  readonly item_id: string
  /** Escala 6 (micro-reais), como o campo `valor_aduaneiro_brl` aceita. */
  readonly fob_brl: string
  readonly frete_brl: string
  readonly seguro_brl: string
  readonly valor_aduaneiro_brl: string
  /** VA arredondado HALF_UP a centavos, só para exibição/conferência. */
  readonly valor_aduaneiro_brl_2: string
  readonly criterio_frete: CriterioRateioVa
  readonly criterio_seguro: CriterioRateioVa
}

export type PendenciaValorAduaneiro =
  | 'FRETE_SEM_CAMBIO' | 'SEGURO_SEM_CAMBIO' | 'RATEIO_PARCIAL' | 'PESO_AUSENTE' | 'BASE_RATEIO_ZERO'
  /** Despesa cujo nome casa frete E seguro: o valor não pode ser atribuído a um dos dois sem confirmação. */
  | 'DESPESA_MISTA'

export interface ResultadoValorAduaneiro {
  readonly itens: readonly ItemValorAduaneiroSaida[]
  readonly semBase: readonly { item_id: string; motivo: 'SEM_CAMBIO' }[]
  readonly totais: { fob_brl: string; frete_brl: string; seguro_brl: string; valor_aduaneiro_brl: string }
  /** Vazio ⇒ composição completa e segura para persistir. */
  readonly pendencias: readonly PendenciaValorAduaneiro[]
}

const ESC = 6
const f6 = (v: bigint) => formataDecimal(v, ESC)
const f2 = (v: bigint) => formataDecimal(divide(v, ESC, 1n, 0, 2), 2)

/** Valor em BRL na escala 6: BRL direto; senão moeda × câmbio (taxa com até 10 casas). null = sem câmbio. */
export function valorEmBrl(moeda: string, valor: string, cambios: readonly CambioValorAduaneiro[]): bigint | null {
  if (moeda === 'BRL') return parseDecimal(valor, ESC)
  const c = cambios.find((x) => x.moeda === moeda)
  return c ? multiplica(parseDecimal(valor, ESC), ESC, parseDecimal(c.taxa, 10), 10, ESC) : null
}

function somar(parcelas: readonly ValorEmMoeda[], cambios: readonly CambioValorAduaneiro[]): { total: bigint; semCambio: boolean } {
  let total = 0n
  let semCambio = false
  for (const p of parcelas) {
    const v = valorEmBrl(p.moeda, p.valor, cambios)
    if (v === null) semCambio = true
    else total += v
  }
  return { total, semCambio }
}

export function comporValorAduaneiro(e: EntradaValorAduaneiro): ResultadoValorAduaneiro {
  const criterioFrete = e.criterio_frete ?? 'VALOR_FOB'
  const criterioSeguro = e.criterio_seguro ?? 'VALOR_FOB'
  const pend = new Set<PendenciaValorAduaneiro>()
  const semBase: { item_id: string; motivo: 'SEM_CAMBIO' }[] = []
  const comBase: { it: ItemValorAduaneiro; fob: bigint }[] = []
  for (const it of e.itens) {
    const fob = valorEmBrl(it.moeda, it.valor_mercadoria_moeda, e.cambios)
    if (fob === null) semBase.push({ item_id: it.id, motivo: 'SEM_CAMBIO' })
    else comBase.push({ it, fob })
  }
  if (semBase.length > 0 && comBase.length > 0) pend.add('RATEIO_PARCIAL')

  const frete = somar(e.frete, e.cambios)
  if (frete.semCambio) pend.add('FRETE_SEM_CAMBIO')
  const seguro = somar(e.seguro, e.cambios)
  if (seguro.semCambio) pend.add('SEGURO_SEM_CAMBIO')

  const peso = (x: { it: ItemValorAduaneiro; fob: bigint }, c: CriterioRateioVa): bigint | null => {
    if (c === 'VALOR_FOB') return x.fob
    const p = c === 'PESO_LIQUIDO' ? x.it.peso_liquido_kg : x.it.peso_bruto_kg
    return p ? parseDecimal(p, 3) : null
  }
  /** Rateio exato; qualquer impossibilidade vira pendência e parte zero (nunca inventa). */
  const repartir = (total: bigint, c: CriterioRateioVa): Map<string, bigint> => {
    const out = new Map<string, bigint>()
    if (total === 0n || comBase.length === 0) return out
    const pesos = comBase.map((x) => ({ id: x.it.id, peso: peso(x, c) }))
    if (pesos.some((p) => p.peso === null)) { pend.add('PESO_AUSENTE'); return out }
    const bases = pesos.map((p) => ({ id: p.id, peso: p.peso as bigint }))
    if (bases.reduce((s, b) => s + b.peso, 0n) === 0n) { pend.add('BASE_RATEIO_ZERO'); return out }
    for (const parte of ratear(total, bases).partes) out.set(parte.id, parte.valor)
    return out
  }
  const fr = repartir(frete.total, criterioFrete)
  const sg = repartir(seguro.total, criterioSeguro)

  let tFob = 0n, tFrete = 0n, tSeguro = 0n
  const itens = comBase.map(({ it, fob }) => {
    const vf = fr.get(it.id) ?? 0n
    const vs = sg.get(it.id) ?? 0n
    const va = fob + vf + vs
    tFob += fob; tFrete += vf; tSeguro += vs
    return {
      item_id: it.id, fob_brl: f6(fob), frete_brl: f6(vf), seguro_brl: f6(vs), valor_aduaneiro_brl: f6(va),
      valor_aduaneiro_brl_2: f2(va), criterio_frete: criterioFrete, criterio_seguro: criterioSeguro,
    }
  })
  return {
    itens,
    semBase,
    totais: { fob_brl: f6(tFob), frete_brl: f6(tFrete), seguro_brl: f6(tSeguro), valor_aduaneiro_brl: f6(tFob + tFrete + tSeguro) },
    pendencias: [...pend],
  }
}
