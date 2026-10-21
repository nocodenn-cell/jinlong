/**
 * Ponte pura entre os dados do hub e os módulos determinísticos do shared-core
 * (tributação por NCM, precificação, sugestão de critério). Sem I/O.
 */
import {
  CATALOGO_TRIBUTARIO_DEMO, calcularTributosImportacao, type ParametroTributario, type ResultadoTributacao, type SugestaoTributo,
} from '@shared-core/src/import'
import { formataDecimal, multiplica, parseDecimal } from '@shared-core/src/import/decimal'
import type { Cambio, Item } from './dadosImportacoes'

export type ItemSemBase = { item_id: string; motivo: 'SEM_CAMBIO' }

/** Valor aduaneiro em BRL por item: informado → BRL direto → moeda × câmbio da operação. */
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
): ResultadoTributacao & { semBase: ItemSemBase[] } {
  const { ok, semBase } = basesTributaveis(itens, cambios)
  return { ...calcularTributosImportacao({ data_fato_gerador: data, uf_destino: uf, itens: ok, parametros }), semBase }
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
