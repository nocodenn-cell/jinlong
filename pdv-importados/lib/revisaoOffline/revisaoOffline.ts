/**
 * Fila de revisão de eventos offline (20261028130000 / 20261028150000) — regras puras da tela.
 *
 * A autorização NÃO mora aqui: listar_revisoes_offline e revisar_evento_offline decidem no banco
 * (DONO/GERENTE ativo da loja do evento, empresa isolada, sem autoaprovação, FOR UPDATE, idempotência).
 * Este módulo só valida a entrada antes de ir ao banco, traduz erros do banco em códigos i18n e calcula
 * o que a UI mostra/desabilita (que o banco repete).
 */

export const MOTIVO_MIN = 5
export const MOTIVO_MAX = 500

export type RevisaoStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'RECONCILIADO_AUTO'
export type RevisaoFiltro = 'PENDENTE' | 'DECIDIDOS'
export type Decisao = 'APROVAR' | 'REJEITAR'
export type Classificacao = 'ANTES_INATIVACAO' | 'APOS_INATIVACAO' | 'NAO_COMPROVAVEL'

export type ErroRevisao =
  | 'sessao'
  | 'entrada_invalida'
  | 'motivo_obrigatorio'
  | 'motivo_longo'
  | 'sem_permissao'
  | 'ja_decidida'
  | 'autoaprovacao'
  | 'fora_de_ordem'
  | 'falha'

export type RevisaoResumo = Readonly<{
  totalLiquido?: number
  formaPagamento?: string
  itens?: number
  valorInicial?: number
  valorFechamento?: number
  valor?: number
  tipoMovimento?: string
}>

export type RevisaoItem = Readonly<{
  id: string
  seq: number
  eventId: string
  tipo: string
  origem: string
  lojaId: string
  lojaNome: string
  caixaId: string | null
  vendaId: string | null
  operadorId: string | null
  operadorNome: string | null
  operadorAtivo: boolean | null
  horarioDispositivo: string | null
  recebidoEm: string
  classificacao: Classificacao
  motivo: string
  evidencias: Readonly<Record<string, unknown>>
  resumo: RevisaoResumo
  status: RevisaoStatus
  decididoPor: string | null
  decididoPorNome: string | null
  decididoEm: string | null
  decisaoMotivo: string | null
  anterioresPendentes: number
  eMeuEvento: boolean
}>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STATUS: readonly RevisaoStatus[] = ['PENDENTE', 'APROVADO', 'REJEITADO', 'RECONCILIADO_AUTO']
const CLASSIFICACOES: readonly Classificacao[] = ['ANTES_INATIVACAO', 'APOS_INATIVACAO', 'NAO_COMPROVAVEL']

export type DecisaoValidada = Readonly<{ id: string; decisao: Decisao; motivo: string }>

export function validarDecisao(input: { id?: unknown; decisao?: unknown; motivo?: unknown }):
  | { ok: true; value: DecisaoValidada }
  | { ok: false; erro: ErroRevisao } {
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  if (!UUID_RE.test(id)) return { ok: false, erro: 'entrada_invalida' }
  if (input.decisao !== 'APROVAR' && input.decisao !== 'REJEITAR') return { ok: false, erro: 'entrada_invalida' }
  const motivo = typeof input.motivo === 'string' ? input.motivo.trim() : ''
  if (motivo.length < MOTIVO_MIN) return { ok: false, erro: 'motivo_obrigatorio' }
  if (motivo.length > MOTIVO_MAX) return { ok: false, erro: 'motivo_longo' }
  return { ok: true, value: { id, decisao: input.decisao, motivo } }
}

export function filtroValido(raw: unknown): RevisaoFiltro {
  return raw === 'DECIDIDOS' ? 'DECIDIDOS' : 'PENDENTE'
}

/** Mensagem do banco → código estável (traduzido na UI). Nunca devolve o texto cru do banco ao navegador. */
export function erroRevisaoDoBanco(mensagem: string | null | undefined): ErroRevisao {
  const m = mensagem ?? ''
  if (m.includes('REVISAO_AUTOAPROVACAO_PROIBIDA')) return 'autoaprovacao'
  if (m.includes('REVISAO_JA_DECIDIDA')) return 'ja_decidida'
  if (m.includes('REVISAO_FORA_DE_ORDEM')) return 'fora_de_ordem'
  if (m.includes('REVISAO_MOTIVO_OBRIGATORIO')) return 'motivo_obrigatorio'
  if (m.includes('REVISAO_MOTIVO_LONGO')) return 'motivo_longo'
  if (m.includes('REVISAO_NAO_ENCONTRADA_OU_SEM_PERMISSAO') || m.includes('REVISAO_EXIGE_USUARIO')) return 'sem_permissao'
  if (m.includes('REVISAO_DECISAO_INVALIDA') || m.includes('REVISAO_FILTRO_INVALIDO')) return 'entrada_invalida'
  return 'falha'
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

export type LinhaBanco = Record<string, unknown>

export function mapearLinha(r: LinhaBanco): RevisaoItem {
  const resumo = obj(r.resumo)
  const status = STATUS.includes(r.status as RevisaoStatus) ? (r.status as RevisaoStatus) : 'PENDENTE'
  const classificacao = CLASSIFICACOES.includes(r.classificacao as Classificacao)
    ? (r.classificacao as Classificacao)
    : 'NAO_COMPROVAVEL'
  return {
    id: String(r.id ?? ''),
    seq: num(r.seq) ?? 0,
    eventId: String(r.event_id ?? ''),
    tipo: String(r.tipo ?? ''),
    origem: String(r.origem ?? ''),
    lojaId: String(r.loja_id ?? ''),
    lojaNome: String(r.loja_nome ?? ''),
    caixaId: str(r.caixa_id) ?? null,
    vendaId: str(r.venda_id) ?? null,
    operadorId: str(r.operador_id) ?? null,
    operadorNome: str(r.operador_nome) ?? null,
    operadorAtivo: typeof r.operador_ativo === 'boolean' ? r.operador_ativo : null,
    horarioDispositivo: str(r.horario_dispositivo) ?? null,
    recebidoEm: String(r.recebido_em ?? ''),
    classificacao,
    motivo: String(r.motivo ?? ''),
    evidencias: obj(r.evidencias),
    resumo: {
      totalLiquido: num(resumo.total_liquido),
      formaPagamento: str(resumo.forma_pagamento),
      itens: num(resumo.itens),
      valorInicial: num(resumo.valor_inicial),
      valorFechamento: num(resumo.valor_fechamento),
      valor: num(resumo.valor),
      tipoMovimento: str(resumo.tipo_movimento),
    },
    status,
    decididoPor: str(r.decidido_por) ?? null,
    decididoPorNome: str(r.decidido_por_nome) ?? null,
    decididoEm: str(r.decidido_em) ?? null,
    decisaoMotivo: str(r.decisao_motivo) ?? null,
    anterioresPendentes: num(r.anteriores_pendentes) ?? 0,
    eMeuEvento: r.e_meu_evento === true,
  }
}

export type BloqueioDecisao = 'decidido' | 'meu_evento' | 'fora_de_ordem'

/**
 * O que a UI deixa fazer. Espelha o banco (que decide de verdade):
 * - decidido: só PENDENTE aceita decisão;
 * - meu_evento: ninguém decide o próprio evento (nem rejeita);
 * - fora_de_ordem: aprovar exige decidir antes os anteriores do mesmo caixa (rejeitar pode).
 */
export function bloqueiosDecisao(item: Pick<RevisaoItem, 'status' | 'eMeuEvento' | 'anterioresPendentes'>): {
  aprovar: BloqueioDecisao | null
  rejeitar: BloqueioDecisao | null
} {
  if (item.status !== 'PENDENTE') return { aprovar: 'decidido', rejeitar: 'decidido' }
  if (item.eMeuEvento) return { aprovar: 'meu_evento', rejeitar: 'meu_evento' }
  return { aprovar: item.anterioresPendentes > 0 ? 'fora_de_ordem' : null, rejeitar: null }
}

/** Evidências exibidas (chaves conhecidas, na ordem); o resto fica de fora para não poluir a tela. */
export const EVIDENCIAS_EXIBIDAS = [
  'perdeu_acesso_em',
  'perda_de_acesso_em',
  'horario_dispositivo',
  'primeiro_recebimento_em',
  'recebimentos',
  'payload_divergente',
  'token_criado_em',
  'token_revogado_em',
  'token_revogado_motivo',
  'caixa_em_revisao',
  'avaliado_em',
] as const

export function evidenciasVisiveis(ev: Readonly<Record<string, unknown>>): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const k of EVIDENCIAS_EXIBIDAS) {
    const v = ev[k]
    if (v === undefined || v === null || v === '') continue
    out.push([k, typeof v === 'string' ? v : JSON.stringify(v)])
  }
  return out
}
