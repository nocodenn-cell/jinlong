/**
 * Ponte pura entre os dados do hub e os módulos determinísticos do shared-core
 * (tributação por NCM, precificação, sugestão de critério). Sem I/O.
 */
import {
  CATALOGO_TRIBUTARIO_DEMO, DESPESAS_FEDERAIS_INFO, calcularAfrmm, calcularTributosImportacao, comporValorAduaneiro, incorporaPorRegime, ratear,
  type CriterioRateioVa, type ItemValorAduaneiroSaida, type ParametroTributario, type PendenciaValorAduaneiro, type RegimeTributario,
  type ResultadoTributacao, type SugestaoTributo,
} from '@shared-core/src/import'
import { divide, formataDecimal, multiplica, parseDecimal } from '@shared-core/src/import/decimal'
const f2 = (v: bigint) => formataDecimal(divide(v, 6, 1n, 0, 2), 2)
import type { Cambio, Despesa, Item } from './dadosImportacoes'

/** Opções do modo nacional (empresa configurada). Ausente ⇒ comportamento do #601 (demo). */
export type OpcoesNacional = { despesas: readonly Despesa[]; maritimo: boolean; regime: RegimeTributario }

/*
 * Classificação de despesas por TEXTO do tipo (regex). FRÁGIL por natureza: depende de como o
 * usuário nomeia o lançamento ("Frete internacional", "AFRMM (8% do frete)"...). Mantida porque
 * import_despesas não tem tipo estruturado; qualquer mudança aqui altera VA e base do ICMS.
 */
const RE_FRETE = /frete|freight|运费/i
const RE_FRETE_LOCAL = /(?<!inter)nacional|interno|rodovi|local|国内/i
const RE_SEGURO = /seguro|insurance|保险/i
const RE_SISCOMEX = /siscomex/i
const RE_AFRMM = /afrmm|marinha mercante/i
const ehSeguro = (t: string) => RE_SEGURO.test(t)
/** Nome que casa frete E seguro (ex.: "Freight insurance"): ambíguo, não atribuível sem confirmação. */
const ehMista = (t: string) => RE_FRETE.test(t) && RE_SEGURO.test(t)
/**
 * Frete internacional: exclui frete local, encargos que CITAM frete (AFRMM "8% do frete", Siscomex) e
 * seguro ("Freight insurance", "Frete + seguro"): cada despesa entra em UMA parcela só (sem dupla contagem).
 */
const ehFreteInternacional = (t: string) =>
  RE_FRETE.test(t) && !RE_FRETE_LOCAL.test(t) && !RE_AFRMM.test(t) && !RE_SISCOMEX.test(t) && !ehSeguro(t)

export type ItemSemBase = { item_id: string; motivo: 'SEM_CAMBIO' }

/** Critério fiscal de rateio de frete/seguro no VA — PENDENTE de validação (despachante/contador). */
export const CRITERIO_VA_PADRAO: CriterioRateioVa = 'VALOR_FOB'

function emBrl(moeda: string, valor: string, cambios: readonly Cambio[]): bigint | null {
  if (moeda === 'BRL') return parseDecimal(valor, 6)
  const c = cambios.find((x) => x.moeda === moeda)
  return c ? multiplica(parseDecimal(valor, 6), 6, parseDecimal(c.taxa, 10), 10, 6) : null
}
const somaTipo = (ds: readonly Despesa[], cambios: readonly Cambio[], f: (t: string) => boolean) =>
  ds.filter((d) => f(d.tipo)).reduce((a, d) => a + (emBrl(d.moeda, d.valor, cambios) ?? 0n), 0n)
const parcelas = (ds: readonly Despesa[], f: (t: string) => boolean) => ds.filter((d) => f(d.tipo)).map((d) => ({ moeda: d.moeda, valor: d.valor }))

/** Rateio exato (maior resto, shared-core) de `total` pelos pesos; pesos nulos/zero não recebem. */
function repartirExato(total: bigint, ids: readonly string[], pesos: readonly (bigint | null)[]): bigint[] {
  const bases = ids.map((id, k) => ({ id, peso: pesos[k] ?? 0n }))
  if (total === 0n || bases.every((b) => b.peso === 0n)) return ids.map(() => 0n)
  const porId = new Map(ratear(total, bases).partes.map((p) => [p.id, p.valor]))
  return ids.map((id) => porId.get(id) ?? 0n)
}

export type ComposicaoVaItem = ItemValorAduaneiroSaida & {
  /** VA informado no item (prevalece no motor); null = ausente. */
  informado_brl: string | null
}
export type ComposicaoVa = {
  itens: ComposicaoVaItem[]
  semBase: ItemSemBase[]
  pendencias: PendenciaValorAduaneiro[]
  totais: { fob_brl: string; frete_brl: string; seguro_brl: string; valor_aduaneiro_brl: string }
  /** Itens SEM VA informado e com base calculável (alvos do "usar VA calculado"). */
  semValorInformado: string[]
}

/**
 * Composição do VA da operação a partir dos dados do hub (fonte canônica: shared-core comporValorAduaneiro).
 * Frete internacional e seguro vêm das despesas lançadas; critério fiscal padrão VALOR_FOB.
 * Independe do catálogo tributário (demo ou nacional): VA = FOB + frete + seguro.
 */
export function composicaoValorAduaneiro(
  itens: readonly Item[], cambios: readonly Cambio[], despesas: readonly Despesa[],
  criterio: { frete?: CriterioRateioVa; seguro?: CriterioRateioVa } = {},
): ComposicaoVa {
  const r = comporValorAduaneiro({
    itens, cambios,
    frete: parcelas(despesas, ehFreteInternacional),
    seguro: parcelas(despesas, (t) => ehSeguro(t) && !ehMista(t)),
    criterio_frete: criterio.frete ?? CRITERIO_VA_PADRAO,
    criterio_seguro: criterio.seguro ?? CRITERIO_VA_PADRAO,
  })
  const mistas = despesas.some((d) => ehMista(d.tipo))
  const informado = new Map(itens.map((i) => [i.id, i.valor_aduaneiro_brl || null]))
  const comp = r.itens.map((x) => ({ ...x, informado_brl: informado.get(x.item_id) ?? null }))
  return {
    itens: comp, semBase: [...r.semBase], pendencias: mistas ? [...r.pendencias, 'DESPESA_MISTA'] : [...r.pendencias], totais: r.totais,
    semValorInformado: comp.filter((x) => x.informado_brl === null).map((x) => x.item_id),
  }
}

/** AFRMM e Siscomex considerados na base do ICMS (regra atual, inalterada) e os efetivamente lançados. */
function encargosAduaneiros(despesas: readonly Despesa[], cambios: readonly Cambio[], maritimo: boolean, freteBrl: bigint) {
  const nSis = despesas.filter((d) => RE_SISCOMEX.test(d.tipo)).length
  const nAfr = despesas.filter((d) => RE_AFRMM.test(d.tipo)).length
  const sisLanc = somaTipo(despesas, cambios, (t) => RE_SISCOMEX.test(t))
  const afrLanc = somaTipo(despesas, cambios, (t) => RE_AFRMM.test(t))
  return {
    siscomex: nSis > 0 ? sisLanc : parseDecimal(DESPESAS_FEDERAIS_INFO.siscomex_taxa_brl, 6),
    afrmm: nAfr > 0 ? afrLanc : parseDecimal(calcularAfrmm(formataDecimal(freteBrl, 6), maritimo), 6),
    sisLanc, afrLanc, nSis, nAfr,
  }
}

/**
 * Modo nacional: VA não informado ⇒ composição canônica (FOB + frete internacional + seguro, rateados
 * pelo critério fiscal VALOR_FOB); despesas aduaneiras (Siscomex + AFRMM) repartidas pelo VA para a base do ICMS.
 * Siscomex: valor lançado pelo usuário; sem lançamento ⇒ taxa por DI. AFRMM: lançado ou 8% do frete marítimo.
 * Rateios exatos (maior resto) — substituem o antigo truncamento com resíduo no último item.
 */
export function basesNacionais(itens: readonly Item[], cambios: readonly Cambio[], o: OpcoesNacional) {
  const comp = composicaoValorAduaneiro(itens, cambios, o.despesas)
  const vaComp = new Map(comp.itens.map((x) => [x.item_id, parseDecimal(x.valor_aduaneiro_brl, 6)]))
  const frete = parseDecimal(comp.totais.frete_brl, 6)
  const seguro = parseDecimal(comp.totais.seguro_brl, 6)
  const vas = itens.map((i) => (i.valor_aduaneiro_brl ? parseDecimal(i.valor_aduaneiro_brl, 6) : vaComp.get(i.id) ?? null))
  const enc = encargosAduaneiros(o.despesas, cambios, o.maritimo, frete)
  const desp = repartirExato(enc.siscomex + enc.afrmm, itens.map((i) => i.id), vas)
  const ok: { item_id: string; ncm: string | null; valor_aduaneiro_brl: string; despesas_aduaneiras_brl: string }[] = []
  const semBase: ItemSemBase[] = []
  itens.forEach((i, k) => {
    const va = vas[k]
    if (va === null) { semBase.push({ item_id: i.id, motivo: 'SEM_CAMBIO' }); return }
    ok.push({ item_id: i.id, ncm: i.ncm, valor_aduaneiro_brl: formataDecimal(va, 6), despesas_aduaneiras_brl: formataDecimal(desp[k], 6) })
  })
  return { ok, semBase, resumo: { frete_brl: f2(frete), seguro_brl: f2(seguro), siscomex_brl: f2(enc.siscomex), afrmm_brl: f2(enc.afrmm), afrmm_calculado: enc.nAfr === 0 } }
}

export type ConciliacaoEncargos = {
  afrmm_icms: string; siscomex_icms: string; afrmm_lancado: string; siscomex_lancado: string
  /** Encargos na base do ICMS que não estão lançados como despesa (logo, fora do custo). */
  ausente_no_custo_brl: string
  /** Mais de um lançamento de AFRMM ou de Siscomex (possível dupla contagem). */
  duplicado: boolean
}

/**
 * P2 — Conciliação pura (NÃO altera regra fiscal nem cria lançamentos): compara AFRMM e Siscomex
 * usados na base do ICMS com o que foi lançado em import_despesas. Classificação por regex do tipo
 * (frágil: depende do nome dado pelo usuário). Lançamentos contam independentemente de `incorporavel`
 * (decisão fiscal F-05 pendente).
 */
export function conciliarEncargosAduaneiros(despesas: readonly Despesa[], cambios: readonly Cambio[], maritimo: boolean): ConciliacaoEncargos {
  const frete = somaTipo(despesas, cambios, ehFreteInternacional)
  const e = encargosAduaneiros(despesas, cambios, maritimo, frete)
  const falta = (icms: bigint, lanc: bigint) => (icms > lanc ? icms - lanc : 0n)
  return {
    afrmm_icms: f2(e.afrmm), siscomex_icms: f2(e.siscomex), afrmm_lancado: f2(e.afrLanc), siscomex_lancado: f2(e.sisLanc),
    ausente_no_custo_brl: f2(falta(e.afrmm, e.afrLanc) + falta(e.siscomex, e.sisLanc)),
    duplicado: e.nAfr > 1 || e.nSis > 1,
  }
}

/**
 * Modo demo (sem configuração nacional): base = FOB × câmbio, SEM frete/seguro — semântica histórica
 * do #601, mantida de propósito (NÃO é o VA fiscal completo; ver composicaoValorAduaneiro). Usa a mesma
 * conversão canônica (comporValorAduaneiro sem frete/seguro); VA informado no item prevalece.
 */
export function basesTributaveis(itens: readonly Item[], cambios: readonly Cambio[]) {
  const comp = comporValorAduaneiro({ itens, cambios, frete: [], seguro: [] })
  const fob = new Map(comp.itens.map((x) => [x.item_id, x.fob_brl]))
  const ok: { item_id: string; ncm: string | null; valor_aduaneiro_brl: string }[] = []
  const semBase: ItemSemBase[] = []
  for (const i of itens) {
    const v = i.valor_aduaneiro_brl || fob.get(i.id)
    if (v) ok.push({ item_id: i.id, ncm: i.ncm, valor_aduaneiro_brl: v })
    else semBase.push({ item_id: i.id, motivo: 'SEM_CAMBIO' })
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
