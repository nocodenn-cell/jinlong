/**
 * Catálogo NACIONAL de importação (opção A do plano-modulo-importacao-nacional.md).
 *
 * Mantemos apenas: (1) ICMS modal interno + FCP geral das 27 UFs e (2) os poucos valores federais.
 * II e IPI dependem do NCM e vêm do CLIENTE ou do despachante (DI/DUIMP) — nunca mantidos por nós.
 * Incentivos estaduais (PRODEPE, TTD, Compete...) NÃO são modelados: o cliente informa o
 * "% efetivo de ICMS" (override CONFIGURADO_CLIENTE).
 *
 * ICMS da importação é devido à UF do IMPORTADOR, independente do porto (LC 87/96 art. 11, I, "d"
 * e art. 12, IX; STF Tema 520). O porto/modal só afeta custos (AFRMM apenas marítimo).
 *
 * Tudo é ESTIMATIVA — confirme com seu contador/despachante. Status "PESQUISADO" = fonte pública
 * (secundária citando a lei estadual), ainda não verificada na SEFAZ nem validada por contador.
 * Consulta: 21/10/2026. Revisão: anual (janeiro) + 1º de abril.
 */
import { CATALOGO_TRIBUTARIO_PESQUISADO_PE, type ParametroTributario, type TributoImportacao } from './tributacao'
import { divide, formataDecimal, multiplica, parseDecimal } from './decimal'

/** Percentual escrito com vírgula (sem literal decimal no motor). */
const p = (v: string): string => v.replace(',', '.')

export const CATALOGO_NACIONAL_VERSAO = 'nacional-2026-10-21'
export type StatusCatalogoUf = 'PESQUISADO' | 'VERIFICADO'

export interface AliquotaUf {
  readonly uf: string
  readonly icms_modal_pct: string
  /** FCP aplicado à REGRA GERAL (só RJ e SE). Nas demais UFs o FCP só alcança listas de produtos. */
  readonly fcp_geral_pct: string
  readonly vigencia_inicio: string
  readonly base_legal: string
  readonly status: StatusCatalogoUf
  readonly nota: string
}

const F1 = 'https://ajudanota.com.br/tabela-icms'
const F2 = 'https://www.masteryb2b.tech/tabela-icms'
const F3 = 'https://www.ncmbrasil.com.br/icms'
export const FONTES_CATALOGO_UF: readonly string[] = [F1, F2, F3, 'https://www.brasilnfe.com.br/aliquotas-icms/']
export const CONSULTADO_EM = '2026-10-21'

const FCP_LISTA = 'FCP só para lista de produtos da UF (informe por NCM se aplicável)'
/** 27 UFs — ICMS modal 2026. vigencia_inicio = início da redação vigente (quando incerto, data conservadora). */
export const ALIQUOTAS_UF: readonly AliquotaUf[] = [
  { uf: 'AC', icms_modal_pct: p('19,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2023-04-01', base_legal: 'LC AC 55/1997 art. 18 I (LC 422/2022)', status: 'PESQUISADO', nota: 'Sem FCP' },
  { uf: 'AL', icms_modal_pct: p('20,5000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2026-04-01', base_legal: 'Lei AL 5900/1996 art. 17 I "b" (Lei 9776/2025)', status: 'PESQUISADO', nota: `Era 19% até 31/03/2026; ${FCP_LISTA}` },
  { uf: 'AP', icms_modal_pct: p('18,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2016-02-01', base_legal: 'Lei AP 400/1997 art. 37 III "i" (Lei 1949/2015)', status: 'PESQUISADO', nota: 'Sem FCP' },
  { uf: 'AM', icms_modal_pct: p('20,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2023-04-01', base_legal: 'LC AM 19/1997 art. 12 I "b" (LC 244/2023)', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'BA', icms_modal_pct: p('20,5000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2024-02-07', base_legal: 'Lei BA 7014/1996 art. 15 I "a" (Lei 14629/2023)', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'CE', icms_modal_pct: p('20,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2024-01-01', base_legal: 'Lei CE 18665/2023 art. 65 I "g"', status: 'PESQUISADO', nota: `FECOP 2% só para lista; ${FCP_LISTA}` },
  { uf: 'DF', icms_modal_pct: p('20,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2024-01-01', base_legal: 'Lei DF 1254/1996 art. 18 II "c" (Lei 7326/2023)', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'ES', icms_modal_pct: p('17,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2016-01-01', base_legal: 'Lei ES 7000/2001 art. 20 I "a" (aumento revogado pela Lei 12020/2023)', status: 'PESQUISADO', nota: `Compete/Fundap: informe o % efetivo; ${FCP_LISTA}` },
  { uf: 'GO', icms_modal_pct: p('19,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2024-04-01', base_legal: 'Lei GO 11651/1991 art. 27 I (Lei 22460/2023)', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'MA', icms_modal_pct: p('23,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2025-02-23', base_legal: 'Lei MA 7799/2002 art. 23 III (Lei 12426/2024)', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'MT', icms_modal_pct: p('17,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2016-01-01', base_legal: 'Lei MT 7098/1998 art. 14 I "a"', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'MS', icms_modal_pct: p('17,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2016-01-01', base_legal: 'Lei MS 1810/1997 art. 41 III "a"', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'MG', icms_modal_pct: p('18,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2016-01-01', base_legal: 'Lei MG 6763/1975 / RICMS-MG (alíquota geral)', status: 'PESQUISADO', nota: `Corredor de Importação: informe o % efetivo; ${FCP_LISTA}` },
  { uf: 'PA', icms_modal_pct: p('19,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2024-03-16', base_legal: 'Lei PA 5530/1989 (alíquota geral) — data de vigência diverge entre fontes', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'PB', icms_modal_pct: p('20,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2024-01-01', base_legal: 'Lei PB 6379/1996 (alíquota geral) — data de vigência diverge entre fontes', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'PR', icms_modal_pct: p('19,5000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2024-03-18', base_legal: 'Lei PR 11580/1996 art. 14 VIII (Lei 21850/2023)', status: 'PESQUISADO', nota: FCP_LISTA },
  // PE: mesmo id/valor/vigência do catálogo do #601 (zero regressão).
  { uf: 'PE', icms_modal_pct: p('20,5000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2024-01-01', base_legal: 'Lei PE 15730/2016 art. 15 VII (Lei 18305/2023)', status: 'PESQUISADO', nota: 'FECEP 2% só para mercadorias do Anexo 1 (bebidas, fumo, joias etc.) — não para mercadoria comum; PRODEPE: informe o % efetivo' },
  { uf: 'PI', icms_modal_pct: p('22,5000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2025-04-01', base_legal: 'Lei PI 4257/1989 art. 23 I "c" (Lei 8558/2024)', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'RJ', icms_modal_pct: p('20,0000'), fcp_geral_pct: p('2,0000'), vigencia_inicio: '2024-03-20', base_legal: 'Lei RJ 2657/1996 art. 14 I (Lei 10253/2023); FECP Lei 4056/2002', status: 'PESQUISADO', nota: 'FECP 2% na regra geral (carga 22%)' },
  { uf: 'RN', icms_modal_pct: p('20,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2025-03-20', base_legal: 'Lei RN 6968/1996 art. 27 I "a" (Lei 11999/2024)', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'RS', icms_modal_pct: p('17,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2022-01-01', base_legal: 'RICMS-RS Livro I art. 27 X (Lei 15576/2020)', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'RO', icms_modal_pct: p('19,5000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2024-01-12', base_legal: 'Lei RO 688/1996 (alíquota geral)', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'RR', icms_modal_pct: p('20,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2023-03-30', base_legal: 'Lei RR 059/1993 art. 32 I "d" (Lei 1767/2022)', status: 'PESQUISADO', nota: FCP_LISTA },
  { uf: 'SC', icms_modal_pct: p('17,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2016-01-01', base_legal: 'Lei SC 10297/1996 art. 19 I', status: 'PESQUISADO', nota: 'Revenda interna a contribuinte pode ser 12% (art. 19 III "n"); TTD: informe o % efetivo' },
  { uf: 'SP', icms_modal_pct: p('18,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2016-01-01', base_legal: 'RICMS-SP art. 52 I; Lei SP 6374/1989 art. 34', status: 'PESQUISADO', nota: 'Sem FCP geral' },
  { uf: 'SE', icms_modal_pct: p('19,0000'), fcp_geral_pct: p('1,0000'), vigencia_inicio: '2024-01-01', base_legal: 'Lei SE 3796/1996 (Lei 9176/2023); FECOEP Lei 4731/2002 art. 2º-A', status: 'PESQUISADO', nota: 'FECOEP 1% na regra geral (carga 20%)' },
  { uf: 'TO', icms_modal_pct: p('20,0000'), fcp_geral_pct: p('0,0000'), vigencia_inicio: '2016-01-01', base_legal: 'Lei TO 1287/2001 (alíquota geral) — conferir na SEFAZ-TO', status: 'PESQUISADO', nota: FCP_LISTA },
]
export const UFS: readonly string[] = ALIQUOTAS_UF.map((a) => a.uf)

/** Federais (iguais em todas as UFs). PIS/COFINS reaproveitam os ids do #601. */
const pe = (id: string) => CATALOGO_TRIBUTARIO_PESQUISADO_PE.find((p) => p.id === id)!
export const CATALOGO_FEDERAL_NACIONAL: readonly ParametroTributario[] = [
  pe('pesq-pis-imp-geral'),
  { ...pe('pesq-cofins-imp-geral'), nota: 'Lei 10865/2004 art. 8º II; adicional de 0,6 p.p. em 2026 SOMENTE para NCMs do §21 — se for o seu caso, informe a alíquota do NCM' },
  // Correção verificada: CBS/IBS NÃO são cobrados em 2026 (fase de teste, dispensa do art. 348 LC 214/2025).
  { id: 'nac-cbs-2026', tributo: 'CBS', ncm_prefixo: '', uf: null, aliquota_pct: p('0,0000'), vigencia_inicio: '2026-01-01', vigencia_fim: '2026-12-31', fonte: 'PESQUISADO_PENDENTE_CONTADOR', incorpora_custo_sugerido: false, nota: 'LC 214/2025: 2026 é ano de teste (0,9% destacado, dispensado do recolhimento — art. 348). Cobrança a partir de 2027' },
  { id: 'nac-ibs-2026', tributo: 'IBS', ncm_prefixo: '', uf: null, aliquota_pct: p('0,0000'), vigencia_inicio: '2026-01-01', vigencia_fim: '2026-12-31', fonte: 'PESQUISADO_PENDENTE_CONTADOR', incorpora_custo_sugerido: false, nota: 'LC 214/2025: 2026 teste (0,1% destacado, dispensado — art. 348). IBS substitui o ICMS gradualmente 2029–2033' },
  // 2027+: alíquotas de referência ainda não publicadas ⇒ PENDENTE_ALIQUOTA (nada inventado).
  { id: 'nac-cbs-2027', tributo: 'CBS', ncm_prefixo: '', uf: null, aliquota_pct: null, vigencia_inicio: '2027-01-01', vigencia_fim: null, fonte: 'PESQUISADO_PENDENTE_CONTADOR', incorpora_custo_sugerido: false, nota: 'CBS cobrada a partir de 2027 (LC 214/2025): informe a alíquota vigente' },
  { id: 'nac-ibs-2027', tributo: 'IBS', ncm_prefixo: '', uf: null, aliquota_pct: null, vigencia_inicio: '2027-01-01', vigencia_fim: null, fonte: 'PESQUISADO_PENDENTE_CONTADOR', incorpora_custo_sugerido: false, nota: 'IBS: transição 2029–2033 com redução gradual do ICMS (EC 132/2023): informe a alíquota vigente' },
]

/** Valores federais informativos (não entram no motor de tributos; são despesas). */
export const DESPESAS_FEDERAIS_INFO = {
  afrmm_pct: p('8,0000'), // Lei 10893/2004 — só transporte MARÍTIMO, sobre o frete
  siscomex_taxa_brl: p('115,67'),
} as const

export type ModalTransporte = 'MARITIMO' | 'AEREO' | 'RODOVIARIO'
export const aplicaAfrmm = (m: ModalTransporte | null | undefined): boolean => m === 'MARITIMO'

export interface OverrideCliente {
  readonly id: string
  readonly tributo: TributoImportacao
  readonly ncm_prefixo: string
  readonly aliquota_pct: string
  readonly nota?: string | null
}

export interface ConfigImportacaoEmpresa {
  readonly uf: string
  /** % efetivo de ICMS informado pelo cliente (incentivo estadual). Nulo = modal da UF. */
  readonly icms_efetivo_pct?: string | null
  readonly overrides?: readonly OverrideCliente[]
}

const somaPct = (a: string, b: string) => formataDecimal(parseDecimal(a, 4) + parseDecimal(b, 4), 4)

export function aliquotaDaUf(uf: string, tabela: readonly AliquotaUf[] = ALIQUOTAS_UF): AliquotaUf | null {
  return tabela.find((a) => a.uf === uf.toUpperCase()) ?? null
}

/** ICMS row da UF no formato do motor. PE reproduz exatamente o parâmetro do #601. */
export function parametroIcmsUf(a: AliquotaUf): ParametroTributario {
  if (a.uf === 'PE' && a.fcp_geral_pct === p('0,0000') && a.icms_modal_pct === p('20,5000') && a.vigencia_inicio === '2024-01-01') {
    return pe('pesq-icms-pe-modal')
  }
  const fcp = parseDecimal(a.fcp_geral_pct, 4) > 0n
  return {
    id: `pesq-icms-${a.uf.toLowerCase()}-modal`, tributo: 'ICMS', ncm_prefixo: '', uf: a.uf,
    aliquota_pct: fcp ? somaPct(a.icms_modal_pct, a.fcp_geral_pct) : a.icms_modal_pct,
    vigencia_inicio: a.vigencia_inicio, vigencia_fim: null,
    fonte: a.status === 'VERIFICADO' ? 'VALIDADO_CONTADOR' : 'PESQUISADO_PENDENTE_CONTADOR',
    incorpora_custo_sugerido: false,
    nota: `${a.base_legal}; base por dentro${fcp ? `; inclui FCP geral ${a.fcp_geral_pct}%` : ''}; ${a.nota}`,
  }
}

/**
 * Parâmetros para a empresa: federais + ICMS da UF do importador + overrides do cliente
 * (CONFIGURADO_CLIENTE vence o pesquisado no desempate do motor). `tabela` vem do banco quando
 * houver; vazia/indisponível ⇒ constante embarcada (fallback).
 */
export function montarCatalogoNacional(cfg: ConfigImportacaoEmpresa, tabela?: readonly AliquotaUf[] | null): ParametroTributario[] {
  const t = tabela && tabela.length > 0 ? tabela : ALIQUOTAS_UF
  const uf = cfg.uf.toUpperCase()
  const out: ParametroTributario[] = [...CATALOGO_FEDERAL_NACIONAL]
  for (const a of t) if (a.uf === uf) out.push(parametroIcmsUf(a))
  if (cfg.icms_efetivo_pct) {
    out.push({ id: 'cli-icms-efetivo', tributo: 'ICMS', ncm_prefixo: '', uf, aliquota_pct: formataDecimal(parseDecimal(cfg.icms_efetivo_pct, 4), 4),
      vigencia_inicio: '2000-01-01', vigencia_fim: null, fonte: 'CONFIGURADO_CLIENTE', incorpora_custo_sugerido: false,
      nota: '% efetivo de ICMS informado pelo cliente (incentivo estadual)' })
  }
  for (const o of cfg.overrides ?? []) {
    out.push({ id: `cli-${o.id}`, tributo: o.tributo, ncm_prefixo: o.ncm_prefixo.replace(/\D/g, ''), uf: o.tributo === 'ICMS' ? uf : null,
      aliquota_pct: formataDecimal(parseDecimal(o.aliquota_pct, 4), 4), vigencia_inicio: '2000-01-01', vigencia_fim: null,
      fonte: 'CONFIGURADO_CLIENTE', incorpora_custo_sugerido: o.tributo === 'II' || o.tributo === 'IPI',
      nota: o.nota?.trim() || 'Informado pelo cliente/despachante' })
  }
  return out
}

// ---------------------------------------------------------------------------
// Simulador de revenda interestadual (Res. Senado 13/2012) — estimativa.
// ---------------------------------------------------------------------------
const SUL_SUDESTE_SEM_ES = new Set(['SP', 'RJ', 'MG', 'PR', 'RS', 'SC'])

/** Alíquota interestadual "normal" (Res. Senado 22/1989): 7% de S/SE (exceto ES) para N/NE/CO/ES; senão 12%. */
export function aliquotaInterestadualGeral(origem: string, destino: string): string {
  return SUL_SUDESTE_SEM_ES.has(origem) && !SUL_SUDESTE_SEM_ES.has(destino) ? p('7,0000') : p('12,0000')
}

export type AvisoRevenda = 'DIFAL_NAO_CONTRIBUINTE' | 'POSSIVEL_ST' | 'FCI_OBRIGATORIA' | 'OPERACAO_INTERNA' | 'UF_DESCONHECIDA'

export interface EntradaRevenda {
  readonly uf_origem: string
  readonly uf_destino: string
  readonly preco_venda_brl: string
  /** Conteúdo de importação (%). > 40% ⇒ 4% (Res. Senado 13/2012). Padrão: 100 (revenda do importado). */
  readonly conteudo_importacao_pct?: string
  readonly destinatario_contribuinte: boolean
}

export interface ResultadoRevenda {
  readonly interestadual: boolean
  readonly aliquota_pct: string
  readonly icms_destacado_brl: string
  readonly aliquota_interna_destino_pct: string | null
  /** DIFAL estimado (só não contribuinte): preço × (interna destino − interestadual). */
  readonly difal_estimado_brl: string | null
  readonly regra: 'RES_SENADO_13_2012' | 'INTERESTADUAL_GERAL' | 'INTERNA'
  readonly avisos: readonly AvisoRevenda[]
}

export function simularRevendaInterestadual(e: EntradaRevenda, tabela: readonly AliquotaUf[] = ALIQUOTAS_UF): ResultadoRevenda {
  const o = e.uf_origem.toUpperCase()
  const d = e.uf_destino.toUpperCase()
  const ao = aliquotaDaUf(o, tabela)
  const ad = aliquotaDaUf(d, tabela)
  const preco = divide(parseDecimal(e.preco_venda_brl, 6), 6, 1n, 0, 2)
  const avisos: AvisoRevenda[] = ['POSSIVEL_ST']
  if (!ao || !ad) {
    return { interestadual: o !== d, aliquota_pct: p('0,0000'), icms_destacado_brl: p('0,00'), aliquota_interna_destino_pct: null, difal_estimado_brl: null, regra: 'INTERNA', avisos: ['UF_DESCONHECIDA'] }
  }
  const cargaDestino = parametroIcmsUf(ad).aliquota_pct!
  const valor = (pct: string) => formataDecimal(divide(multiplica(preco, 2, parseDecimal(pct, 4), 4, 6), 6, 100n, 0, 2), 2)
  if (o === d) {
    const aliq = parametroIcmsUf(ao).aliquota_pct!
    return { interestadual: false, aliquota_pct: aliq, icms_destacado_brl: valor(aliq), aliquota_interna_destino_pct: aliq, difal_estimado_brl: null, regra: 'INTERNA', avisos: ['OPERACAO_INTERNA', ...avisos] }
  }
  const conteudo = parseDecimal(e.conteudo_importacao_pct ?? '100', 4)
  const usa4 = conteudo > 400000n
  const aliq = usa4 ? p('4,0000') : aliquotaInterestadualGeral(o, d)
  if (usa4) avisos.push('FCI_OBRIGATORIA')
  let difal: string | null = null
  if (!e.destinatario_contribuinte) {
    const dif = parseDecimal(cargaDestino, 4) - parseDecimal(aliq, 4)
    difal = valor(formataDecimal(dif > 0n ? dif : 0n, 4))
    avisos.unshift('DIFAL_NAO_CONTRIBUINTE')
  }
  return { interestadual: true, aliquota_pct: aliq, icms_destacado_brl: valor(aliq), aliquota_interna_destino_pct: cargaDestino, difal_estimado_brl: difal, regra: usa4 ? 'RES_SENADO_13_2012' : 'INTERESTADUAL_GERAL', avisos }
}
