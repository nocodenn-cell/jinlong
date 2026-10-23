/**
 * Ponte pura entre os dados do hub e os módulos determinísticos do shared-core
 * (tributação por NCM, precificação, sugestão de critério). Sem I/O.
 */
import {
  CATALOGO_TRIBUTARIO_DEMO, DESPESAS_FEDERAIS_INFO, calcularAfrmm, calcularTributosImportacao, incorporaPorRegime,
  type ParametroTributario, type RegimeTributario, type ResultadoTributacao, type SugestaoTributo,
} from '@shared-core/src/import'
import { divide, formataDecimal, multiplica, parseDecimal } from '@shared-core/src/import/decimal'
const f2 = (v: bigint) => formataDecimal(divide(v, 6, 1n, 0, 2), 2)
import type { Cambio, Despesa, Item } from './dadosImportacoes'

/** Opções do modo nacional (empresa configurada). Ausente ⇒ comportamento do #601 (demo). */
export type OpcoesNacional = { despesas: readonly Despesa[]; maritimo: boolean; regime: RegimeTributario }

const RE_FRETE = /frete|freight|运费/i
const RE_FRETE_LOCAL = /(?<!inter)nacional|interno|rodovi|local|国内/i
const RE_SEGURO = /seguro|insurance|保险/i
const RE_SISCOMEX = /siscomex/i
const RE_AFRMM = /afrmm|marinha mercante/i

export type ItemSemBase = { item_id: string; motivo: 'SEM_CAMBIO' }

/** Valor aduaneiro em BRL por item: informado → BRL direto → moeda × câmbio da operação. */
function emBrl(moeda: string, valor: string, cambios: readonly Cambio[]): bigint | null {
  if (moeda === 'BRL') return parseDecimal(valor, 6)
  const c = cambios.find((x) => x.moeda === moeda)
  return c ? multiplica(parseDecimal(valor, 6), 6, parseDecimal(c.taxa, 10), 10, 6) : null
}
const somaTipo = (ds: readonly Despesa[], cambios: readonly Cambio[], f: (t: string) => boolean) =>
  ds.filter((d) => f(d.tipo)).reduce((a, d) => a + (emBrl(d.moeda, d.valor, cambios) ?? 0n), 0n)
/** Reparte `total` (escala 6) proporcionalmente aos pesos; o último leva o resíduo. */
function repartir(total: bigint, pesos: bigint[]): bigint[] {
  const soma = pesos.reduce((a, b) => a + b, 0n)
  if (soma === 0n || total === 0n) return pesos.map(() => 0n)
  let resto = total
  return pesos.map((p, i) => { if (i === pesos.length - 1) return resto; const v = (total * p) / soma; resto -= v; return v })
}

/**
 * Modo nacional: VA não informado ⇒ (FOB + frete internacional + seguro) × câmbio, com frete/seguro
 * repartidos pelo FOB; despesas aduaneiras (Siscomex + AFRMM) repartidas pelo VA para a base do ICMS.
 * Siscomex: valor lançado pelo usuário; sem lançamento ⇒ taxa por DI. AFRMM: lançado ou 8% do frete marítimo.
 */
export function basesNacionais(itens: readonly Item[], cambios: readonly Cambio[], o: OpcoesNacional) {
  const fob = itens.map((i) => emBrl(i.moeda, i.valor_mercadoria_moeda, cambios))
  const frete = somaTipo(o.despesas, cambios, (t) => RE_FRETE.test(t) && !RE_FRETE_LOCAL.test(t))
  const seguro = somaTipo(o.despesas, cambios, (t) => RE_SEGURO.test(t))
  const extra = repartir(frete + seguro, fob.map((v) => v ?? 0n))
  const vas = itens.map((i, k) => (i.valor_aduaneiro_brl ? parseDecimal(i.valor_aduaneiro_brl, 6) : fob[k] === null ? null : fob[k]! + extra[k]))
  const sisLanc = somaTipo(o.despesas, cambios, (t) => RE_SISCOMEX.test(t))
  const siscomex = o.despesas.some((d) => RE_SISCOMEX.test(d.tipo)) ? sisLanc : parseDecimal(DESPESAS_FEDERAIS_INFO.siscomex_taxa_brl, 6)
  const afrmmLanc = o.despesas.some((d) => RE_AFRMM.test(d.tipo))
  const afrmm = afrmmLanc ? somaTipo(o.despesas, cambios, (t) => RE_AFRMM.test(t)) : parseDecimal(calcularAfrmm(formataDecimal(frete, 6), o.maritimo), 6)
  const desp = repartir(siscomex + afrmm, vas.map((v) => v ?? 0n))
  const ok: { item_id: string; ncm: string | null; valor_aduaneiro_brl: string; despesas_aduaneiras_brl: string }[] = []
  const semBase: ItemSemBase[] = []
  itens.forEach((i, k) => {
    const va = vas[k]
    if (va === null) { semBase.push({ item_id: i.id, motivo: 'SEM_CAMBIO' }); return }
    ok.push({ item_id: i.id, ncm: i.ncm, valor_aduaneiro_brl: formataDecimal(va, 6), despesas_aduaneiras_brl: formataDecimal(desp[k], 6) })
  })
  return { ok, semBase, resumo: { frete_brl: f2(frete), seguro_brl: f2(seguro), siscomex_brl: f2(siscomex), afrmm_brl: f2(afrmm), afrmm_calculado: !afrmmLanc } }
}

export function basesTributaveis(itens: readonly Item[], cambios: readonly Cambio[]) {
  const ok: { item_id: string; ncm: string | null; valor_aduaneiro_brl: string }[] = []
  const semBase: ItemSemBase[] = []
  for (const i of itens) {
    if (i.valor_aduaneiro_brl) { ok.push({ item_id: i.id, ncm: i.ncm, valor_aduaneiro_brl: i.valor_aduaneiro_brl }); continue }
    if (i.moeda === 'BRL') { ok.push({ item_id: i.id, ncm: i.ncm, valor_aduaneiro_brl: i.valor_mercadoria_moeda }); continue }
    const c = cambios.find((x) => x.moeda === i.moeda)
    if (!c) { semBase.push({ item_id: i.id, motivo: 'SEM_CAMBIO' }); continue }
    const v = multiplica(parseDecimal(i.valor_mercadoria_moeda, 6), 6, parseDecimal(c.taxa, 10), 10, 6)
    ok.push({ item_id: i.id, ncm: i.ncm, valor_aduaneiro_brl: formataDecimal(v, 6) })
  }
  return { ok, semBase }
}

export function sugerirTributos(
  itens: readonly Item[], cambios: readonly Cambio[], uf: string | null, data: string,
  parametros: readonly ParametroTributario[] = CATALOGO_TRIBUTARIO_DEMO,
  catalogoVersao?: string,
  nacional?: OpcoesNacional | null,
): ResultadoTributacao & { semBase: ItemSemBase[]; resumoNacional?: ReturnType<typeof basesNacionais>['resumo'] } {
  const b = nacional ? basesNacionais(itens, cambios, nacional) : { ...basesTributaveis(itens, cambios), resumo: undefined }
  const r = calcularTributosImportacao({ data_fato_gerador: data, uf_destino: uf, itens: b.ok, parametros, catalogo_versao: catalogoVersao })
  const sugestoes = nacional
    ? r.sugestoes.map((s) => { const inc = incorporaPorRegime(s.tributo, nacional.regime); return inc === null || s.incorpora_custo_sugerido === null ? s : { ...s, incorpora_custo_sugerido: inc } })
    : r.sugestoes
  return { ...r, sugestoes, semBase: b.semBase, resumoNacional: b.resumo }
}

/** Sugestão CALCULADA → dados do lançamento TRIBUTO (fica PENDENTE de conferência humana). */
export function sugestaoParaLancamento(s: SugestaoTributo, data: string): Record<string, string | boolean | null> {
  return {
    tributo_codigo: s.tributo,
    status_recuperabilidade: s.incorpora_custo_sugerido ? 'NAO_RECUPERAVEL' : 'RECUPERAVEL_POTENCIAL',
    valor_apurado_brl: s.valor_brl,
    item_id: s.item_id,
    regra_id: s.parametro_id,
    regra_incorpora_custo: s.incorpora_custo_sugerido === true,
    regra_vigencia_inicio: s.vigencia_inicio,
    regra_vigencia_fim: s.vigencia_fim,
    data_fato_gerador: data,
    validado_por: null,
  }
}
