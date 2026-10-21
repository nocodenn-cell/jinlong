/**
 * Inteligência tributária de importação — cálculo DETERMINÍSTICO e auditável.
 *
 * - Nenhuma alíquota é "conhecida" pelo código: tudo vem de PARÂMETROS versionados e datados
 *   (`ParametroTributario`), com fonte explícita. O catálogo de demonstração é FICTÍCIO e rotulado.
 * - Reforma Tributária (EC 132/2023, LC 214/2025): CBS/IBS/IS entram como parâmetros com vigência;
 *   sem alíquota informada ⇒ `PENDENTE_ALIQUOTA` (nunca inventada).
 * - Resultado é SUGESTÃO: só vira tributo da operação após registro e conferência humana.
 *
 * Fórmulas (regime comum de importação, simplificado e documentado):
 *   II     = VA × aII
 *   IPI    = (VA + II) × aIPI
 *   PIS    = VA × aPIS          COFINS = VA × aCOFINS
 *   ICMS   = base × aICMS, base "por dentro" = (VA + II + IPI + PIS + COFINS + despesas aduaneiras) / (1 − aICMS)
 *   CBS/IBS/IS = VA × alíquota (apenas quando parametrizado; base definitiva depende de regulamentação)
 * Valores em centavos (escala 2), HALF_UP. Alíquotas em percentual com até 4 casas.
 */
import { divide, formataDecimal, multiplica, parseDecimal } from './decimal'

export type TributoImportacao = 'II' | 'IPI' | 'PIS_IMPORTACAO' | 'COFINS_IMPORTACAO' | 'ICMS' | 'CBS' | 'IBS' | 'IS'
export const TRIBUTOS_IMPORTACAO: readonly TributoImportacao[] = ['II', 'IPI', 'PIS_IMPORTACAO', 'COFINS_IMPORTACAO', 'ICMS', 'CBS', 'IBS', 'IS']

export type FonteParametro = 'FICTICIO_DEMO' | 'CONFIGURADO_CLIENTE' | 'VALIDADO_CONTADOR'

export interface ParametroTributario {
  readonly id: string
  readonly tributo: TributoImportacao
  /** Prefixo de NCM (0–8 dígitos). Vazio = qualquer NCM. O mais longo vence. */
  readonly ncm_prefixo: string
  /** UF de destino (ICMS). Nulo = qualquer UF. */
  readonly uf: string | null
  /** Percentual (texto com ponto, 4 casas). Nulo = alíquota ainda não definida/informada. */
  readonly aliquota_pct: string | null
  readonly vigencia_inicio: string
  readonly vigencia_fim: string | null
  readonly fonte: FonteParametro
  /** Sugestão de recuperabilidade (o cliente/contador confirma). */
  readonly incorpora_custo_sugerido: boolean
  readonly nota: string
}

const PRIORIDADE_FONTE: Record<FonteParametro, number> = { VALIDADO_CONTADOR: 3, CONFIGURADO_CLIENTE: 2, FICTICIO_DEMO: 1 }

/** Percentual escrito com vírgula no catálogo (sem literal decimal no motor). */
const pct = (v: string): string => v.replace(',', '.')

/** Versão do catálogo embarcado (para auditoria da sugestão). */
export const CATALOGO_TRIBUTARIO_VERSAO = 'demo-2026-10-21'

/**
 * Catálogo de DEMONSTRAÇÃO. Todas as alíquotas são FICTÍCIAS (fonte FICTICIO_DEMO) e servem só
 * para exercitar o fluxo. Produção exige parâmetros CONFIGURADO_CLIENTE / VALIDADO_CONTADOR.
 */
export const CATALOGO_TRIBUTARIO_DEMO: readonly ParametroTributario[] = [
  { id: 'demo-ii-geral', tributo: 'II', ncm_prefixo: '', uf: null, aliquota_pct: pct('10,0000'), vigencia_inicio: '2020-01-01', vigencia_fim: null, fonte: 'FICTICIO_DEMO', incorpora_custo_sugerido: true, nota: 'Alíquota fictícia de demonstração' },
  { id: 'demo-ii-8516', tributo: 'II', ncm_prefixo: '8516', uf: null, aliquota_pct: pct('18,0000'), vigencia_inicio: '2020-01-01', vigencia_fim: null, fonte: 'FICTICIO_DEMO', incorpora_custo_sugerido: true, nota: 'Alíquota fictícia de demonstração (posição 8516)' },
  { id: 'demo-ipi-geral', tributo: 'IPI', ncm_prefixo: '', uf: null, aliquota_pct: pct('5,0000'), vigencia_inicio: '2020-01-01', vigencia_fim: null, fonte: 'FICTICIO_DEMO', incorpora_custo_sugerido: true, nota: 'Fictícia; recuperável apenas para contribuinte do IPI' },
  { id: 'demo-pis-geral', tributo: 'PIS_IMPORTACAO', ncm_prefixo: '', uf: null, aliquota_pct: pct('2,1000'), vigencia_inicio: '2020-01-01', vigencia_fim: null, fonte: 'FICTICIO_DEMO', incorpora_custo_sugerido: false, nota: 'Fictícia; recuperabilidade depende do regime (não cumulativo)' },
  { id: 'demo-cofins-geral', tributo: 'COFINS_IMPORTACAO', ncm_prefixo: '', uf: null, aliquota_pct: pct('9,6500'), vigencia_inicio: '2020-01-01', vigencia_fim: null, fonte: 'FICTICIO_DEMO', incorpora_custo_sugerido: false, nota: 'Fictícia; recuperabilidade depende do regime (não cumulativo)' },
  { id: 'demo-icms-sp', tributo: 'ICMS', ncm_prefixo: '', uf: 'SP', aliquota_pct: pct('18,0000'), vigencia_inicio: '2020-01-01', vigencia_fim: null, fonte: 'FICTICIO_DEMO', incorpora_custo_sugerido: false, nota: 'Fictícia; ICMS por dentro' },
  { id: 'demo-icms-geral', tributo: 'ICMS', ncm_prefixo: '', uf: null, aliquota_pct: pct('17,0000'), vigencia_inicio: '2020-01-01', vigencia_fim: null, fonte: 'FICTICIO_DEMO', incorpora_custo_sugerido: false, nota: 'Fictícia; ICMS por dentro' },
  // Reforma Tributária: marcos datados SEM alíquota (o cliente/contador informa a vigente)
  { id: 'rt-cbs-2026', tributo: 'CBS', ncm_prefixo: '', uf: null, aliquota_pct: null, vigencia_inicio: '2026-01-01', vigencia_fim: null, fonte: 'FICTICIO_DEMO', incorpora_custo_sugerido: false, nota: 'Reforma Tributária (LC 214/2025): informar alíquota vigente na data do fato gerador' },
  { id: 'rt-ibs-2026', tributo: 'IBS', ncm_prefixo: '', uf: null, aliquota_pct: null, vigencia_inicio: '2026-01-01', vigencia_fim: null, fonte: 'FICTICIO_DEMO', incorpora_custo_sugerido: false, nota: 'Reforma Tributária (LC 214/2025): informar alíquota vigente na data do fato gerador' },
]

export interface ItemTributavel {
  readonly item_id: string
  readonly ncm: string | null
  /** Valor aduaneiro em BRL (escala até 6). */
  readonly valor_aduaneiro_brl: string
  /** Despesas aduaneiras do item que entram na base do ICMS (BRL). Opcional. */
  readonly despesas_aduaneiras_brl?: string | null
}

export interface EntradaTributacao {
  readonly data_fato_gerador: string
  readonly uf_destino: string | null
  readonly itens: readonly ItemTributavel[]
  readonly parametros: readonly ParametroTributario[]
  /** Tributos a sugerir (padrão: todos). */
  readonly tributos?: readonly TributoImportacao[]
}

export type StatusSugestao = 'CALCULADO' | 'PENDENTE_ALIQUOTA' | 'SEM_PARAMETRO' | 'NCM_INVALIDO'

export interface SugestaoTributo {
  readonly item_id: string
  readonly tributo: TributoImportacao
  readonly status: StatusSugestao
  readonly base_brl: string | null
  readonly aliquota_pct: string | null
  readonly valor_brl: string | null
  readonly parametro_id: string | null
  readonly fonte: FonteParametro | null
  readonly vigencia_inicio: string | null
  readonly vigencia_fim: string | null
  readonly incorpora_custo_sugerido: boolean | null
  readonly memoria: string
}

export interface ResultadoTributacao {
  readonly catalogo_versao: string
  readonly sugestoes: readonly SugestaoTributo[]
  /** Totais por tributo (apenas CALCULADO), BRL escala 2. */
  readonly totais: Readonly<Record<string, string>>
  /** true quando algum parâmetro usado é FICTICIO_DEMO. */
  readonly usa_parametro_ficticio: boolean
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

export function resolverParametro(
  parametros: readonly ParametroTributario[],
  tributo: TributoImportacao,
  ncm: string,
  uf: string | null,
  data: string,
): ParametroTributario | null {
  const candidatos = parametros.filter(
    (p) =>
      p.tributo === tributo &&
      ncm.startsWith(p.ncm_prefixo) &&
      (p.uf === null || (uf !== null && p.uf === uf.toUpperCase())) &&
      p.vigencia_inicio <= data &&
      (p.vigencia_fim === null || p.vigencia_fim >= data),
  )
  candidatos.sort(
    (a, b) =>
      b.ncm_prefixo.length - a.ncm_prefixo.length ||
      (b.uf !== null ? 1 : 0) - (a.uf !== null ? 1 : 0) ||
      PRIORIDADE_FONTE[b.fonte] - PRIORIDADE_FONTE[a.fonte] ||
      b.vigencia_inicio.localeCompare(a.vigencia_inicio) ||
      a.id.localeCompare(b.id),
  )
  return candidatos[0] ?? null
}

/** base(escala 2) × pct(escala 4) / 100 → escala 2 HALF_UP. */
function aplicar(base2: bigint, pct4: bigint): bigint {
  return divide(multiplica(base2, 2, pct4, 4, 6), 6, 100n, 0, 2)
}

export function calcularTributosImportacao(e: EntradaTributacao): ResultadoTributacao {
  if (!DATA_RE.test(e.data_fato_gerador)) throw new Error('DATA_FATO_GERADOR_INVALIDA')
  const alvo = new Set(e.tributos ?? TRIBUTOS_IMPORTACAO)
  const sugestoes: SugestaoTributo[] = []
  const totais = new Map<string, bigint>()
  let ficticio = false

  for (const it of e.itens) {
    const ncm = (it.ncm ?? '').replace(/\D/g, '')
    const va = divide(parseDecimal(it.valor_aduaneiro_brl, 6), 6, 1n, 0, 2)
    const desp = it.despesas_aduaneiras_brl ? divide(parseDecimal(it.despesas_aduaneiras_brl, 6), 6, 1n, 0, 2) : 0n
    const calculado = new Map<TributoImportacao, bigint>()

    const sugerir = (tributo: TributoImportacao, base: () => bigint | null, porDentro = false) => {
      if (!alvo.has(tributo)) return
      const vazio = { base_brl: null, aliquota_pct: null, valor_brl: null, parametro_id: null, fonte: null,
        vigencia_inicio: null, vigencia_fim: null, incorpora_custo_sugerido: null }
      if (ncm.length !== 8) {
        sugestoes.push({ item_id: it.item_id, tributo, status: 'NCM_INVALIDO', ...vazio, memoria: `${tributo}: NCM ausente ou inválido — informe 8 dígitos` })
        return
      }
      const p = resolverParametro(e.parametros, tributo, ncm, e.uf_destino, e.data_fato_gerador)
      if (!p) {
        sugestoes.push({ item_id: it.item_id, tributo, status: 'SEM_PARAMETRO', ...vazio, memoria: `${tributo}: sem parâmetro vigente para NCM ${ncm} em ${e.data_fato_gerador}` })
        return
      }
      const meta = { parametro_id: p.id, fonte: p.fonte, vigencia_inicio: p.vigencia_inicio, vigencia_fim: p.vigencia_fim, incorpora_custo_sugerido: p.incorpora_custo_sugerido }
      if (p.fonte === 'FICTICIO_DEMO') ficticio = true
      if (p.aliquota_pct === null) {
        sugestoes.push({ item_id: it.item_id, tributo, status: 'PENDENTE_ALIQUOTA', base_brl: null, aliquota_pct: null, valor_brl: null, ...meta, memoria: `${tributo}: ${p.nota}` })
        return
      }
      const pct = parseDecimal(p.aliquota_pct, 4)
      let b = base()!
      if (porDentro) {
        const fator = 1000000n - pct // (100 − pct) em escala 4
        if (fator <= 0n) throw new Error('ALIQUOTA_POR_DENTRO_INVALIDA')
        b = divide(b * 100n, 2, fator, 4, 2) // b / (1 − pct/100)
      }
      const v = aplicar(b, pct)
      calculado.set(tributo, v)
      totais.set(tributo, (totais.get(tributo) ?? 0n) + v)
      sugestoes.push({
        item_id: it.item_id, tributo, status: 'CALCULADO', base_brl: formataDecimal(b, 2), aliquota_pct: p.aliquota_pct,
        valor_brl: formataDecimal(v, 2), ...meta,
        memoria: `${tributo} = ${formataDecimal(b, 2)} × ${p.aliquota_pct}% = ${formataDecimal(v, 2)}${porDentro ? ' (base por dentro)' : ''} [${p.id}, ${p.fonte}]`,
      })
    }

    const g = (t: TributoImportacao) => calculado.get(t) ?? 0n
    sugerir('II', () => va)
    sugerir('IPI', () => va + g('II'))
    sugerir('PIS_IMPORTACAO', () => va)
    sugerir('COFINS_IMPORTACAO', () => va)
    sugerir('ICMS', () => va + g('II') + g('IPI') + g('PIS_IMPORTACAO') + g('COFINS_IMPORTACAO') + desp, true)
    sugerir('CBS', () => va)
    sugerir('IBS', () => va)
    sugerir('IS', () => va)
  }

  return {
    catalogo_versao: CATALOGO_TRIBUTARIO_VERSAO,
    sugestoes,
    totais: Object.fromEntries([...totais].map(([k, v]) => [k, formataDecimal(v, 2)])),
    usa_parametro_ficticio: ficticio,
  }
}
