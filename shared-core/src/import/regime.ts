/**
 * Regime tributário do importador → o que vira custo (sem crédito) e o que vira crédito.
 *  SIMPLES:   PIS, COFINS e ICMS de importação são custo (LC 123/2006: sem crédito).
 *  PRESUMIDO: PIS/COFINS cumulativos (custo); ICMS creditável.
 *  REAL:      PIS/COFINS não cumulativos (Lei 10.865/2004 art. 15) e ICMS creditáveis.
 * II sempre é custo. IPI é custo para quem não é contribuinte do IPI (comerciante varejista).
 * Sem regime informado ⇒ SIMPLES. Cálculo em bigint, centavos HALF_UP.
 */
import { divide, formataDecimal, multiplica, parseDecimal } from './decimal'
import type { TributoImportacao } from './tributacao'
import { DESPESAS_FEDERAIS_INFO } from './catalogoNacional'

export type RegimeTributario = 'SIMPLES' | 'PRESUMIDO' | 'REAL'
export const REGIMES_TRIBUTARIOS: readonly RegimeTributario[] = ['SIMPLES', 'PRESUMIDO', 'REAL']
export const regimeOuPadrao = (r: string | null | undefined): RegimeTributario =>
  (REGIMES_TRIBUTARIOS as readonly string[]).includes(r ?? '') ? (r as RegimeTributario) : 'SIMPLES'

/** null = mantém a sugestão do catálogo (CBS/IBS/IS e II/IPI). */
export function incorporaPorRegime(tributo: TributoImportacao, regime: RegimeTributario): boolean | null {
  if (tributo === 'PIS_IMPORTACAO' || tributo === 'COFINS_IMPORTACAO') return regime !== 'REAL'
  if (tributo === 'ICMS') return regime === 'SIMPLES'
  return null
}

const c2 = (v: string) => divide(parseDecimal(v, 6), 6, 1n, 0, 2)
const pctDe = (base2: bigint, pct: string) => divide(multiplica(base2, 2, parseDecimal(pct, 4), 4, 6), 6, 100n, 0, 2)

/** AFRMM = 8% do frete (Lei 10.893/2004), só transporte marítimo. */
export function calcularAfrmm(freteBrl: string, maritimo: boolean, pct: string = DESPESAS_FEDERAIS_INFO.afrmm_pct): string {
  return formataDecimal(maritimo ? pctDe(c2(freteBrl), pct) : 0n, 2)
}

export interface EntradaApuracao {
  readonly fob_brl: string; readonly frete_brl: string; readonly seguro_brl: string
  readonly maritimo: boolean; readonly siscomex_brl: string
  readonly ii_pct: string; readonly ipi_pct: string; readonly pis_pct: string; readonly cofins_pct: string; readonly icms_pct: string
  readonly regime: RegimeTributario
}

/** Apuração consolidada (memória de cálculo de uma DI): custo de entrada e créditos por regime. */
export function apurarImportacao(e: EntradaApuracao) {
  const va = c2(e.fob_brl) + c2(e.frete_brl) + c2(e.seguro_brl)
  const ii = pctDe(va, e.ii_pct)
  const ipi = pctDe(va + ii, e.ipi_pct)
  const pis = pctDe(va, e.pis_pct)
  const cofins = pctDe(va, e.cofins_pct)
  const afrmm = c2(calcularAfrmm(e.frete_brl, e.maritimo))
  const sis = c2(e.siscomex_brl)
  const baseIcms = divide((va + ii + ipi + pis + cofins + sis + afrmm) * 100n, 2, 1000000n - parseDecimal(e.icms_pct, 4), 4, 2)
  const icms = pctDe(baseIcms, e.icms_pct)
  const vira = (t: TributoImportacao, v: bigint) => (incorporaPorRegime(t, e.regime) ? v : 0n)
  const custo = va + ii + ipi + sis + afrmm + vira('PIS_IMPORTACAO', pis) + vira('COFINS_IMPORTACAO', cofins) + vira('ICMS', icms)
  const f = (v: bigint) => formataDecimal(v, 2)
  return {
    valor_aduaneiro: f(va), ii: f(ii), ipi: f(ipi), pis: f(pis), cofins: f(cofins), afrmm: f(afrmm), siscomex: f(sis),
    base_icms: f(baseIcms), icms: f(icms), custo_total: f(custo),
    creditos: f(pis + cofins + icms - (vira('PIS_IMPORTACAO', pis) + vira('COFINS_IMPORTACAO', cofins) + vira('ICMS', icms))),
  }
}
