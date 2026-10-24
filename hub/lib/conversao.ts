/** Central de Conversão (GROWTH-001): testes grátis → cliente pagante. Sem dependências de servidor; testável. */
import { isUuid, sanitizeSearch, type LeadStatus, type Parsed } from './model'

export const INTERESSES = ['baixo', 'medio', 'alto'] as const
export type Interesse = (typeof INTERESSES)[number]
export const INTERESSE_LABEL: Record<Interesse, string> = { baixo: 'Baixo', medio: 'Médio', alto: 'Alto' }

export const FORMAS = ['PIX', 'BOLETO', 'CARTAO', 'UNDEFINED'] as const
export type Forma = (typeof FORMAS)[number]
export const FORMA_LABEL: Record<Forma, string> = { PIX: 'Pix', BOLETO: 'Boleto', CARTAO: 'Cartão', UNDEFINED: 'A combinar' }

export const ASSINATURA_LABEL: Record<string, string> = {
  TRIAL: 'Em teste', ATIVA: 'Cliente pagante', INADIMPLENTE: 'Inadimplente', SUSPENSA: 'Suspensa', CANCELADA: 'Cancelada',
}

export interface TrialLead {
  id: string
  protocol: string
  status: LeadStatus
  interesse: Interesse | null
  proximo_contato: string | null
  name: string
  contact: string
  channel: 'whatsapp' | 'wechat' | 'email'
  email: string | null
  locale: 'pt-BR' | 'zh-CN'
  created_at: string
}

export interface Atividade {
  ultimo_acesso: string | null
  usuarios_ativos: number
  lojas_ativas: number
  produtos_proprios: number
  caixas_abertos: number
  vendas_total: number
  vendas_7d: number
  ultima_venda: string | null
}

export interface Trial {
  empresa_id: string
  empresa_nome: string
  criado_em: string
  trial_fim: string
  status: string
  motivo_status: string | null
  plano_codigo: string
  addons: string[]
  qtd_lojas: number
  qtd_caixas: number
  forma_pagamento: string
  valor_mensal_centavos: number | null
  tem_cobranca_asaas: boolean
  lead: TrialLead | null
  ultimo_contato_em: string | null
  solicitou_contratacao_em: string | null
  atividade: Atividade
}

export interface Plano {
  codigo: string
  nome: string
  tipo: 'PLANO' | 'ADDON'
  preco_loja_centavos: number
  preco_caixa_adicional_centavos: number
  caixas_inclusos_por_loja: number
  max_lojas: number | null
  preco_placeholder: boolean
}

const DIA = 86_400_000

// ── Fase do período de avaliação ─────────────────────────────────────────────
export const FASES = ['em_teste', 'expira_logo', 'expirado', 'cliente', 'encerrado'] as const
export type Fase = (typeof FASES)[number]
export const FASE_LABEL: Record<Fase, string> = {
  em_teste: 'Em teste', expira_logo: 'Expira em até 3 dias', expirado: 'Teste expirado', cliente: 'Cliente pagante', encerrado: 'Encerrado',
}

export function diasRestantes(t: Pick<Trial, 'trial_fim'>, now: Date = new Date()): number {
  return Math.ceil((new Date(t.trial_fim).getTime() - now.getTime()) / DIA)
}

export function fase(t: Pick<Trial, 'status' | 'motivo_status' | 'trial_fim'>, now: Date = new Date()): Fase {
  if (t.status === 'ATIVA') return 'cliente'
  if (t.status === 'TRIAL') return diasRestantes(t, now) <= 3 ? (new Date(t.trial_fim) < now ? 'expirado' : 'expira_logo') : 'em_teste'
  if (t.status === 'SUSPENSA' && t.motivo_status === 'TRIAL_EXPIRADO') return 'expirado'
  return 'encerrado'
}

/** Mesma regra da RPC commercial_converter_trial (o banco decide; aqui só para a tela). */
export function convertivel(t: Pick<Trial, 'status' | 'motivo_status' | 'tem_cobranca_asaas'>): boolean {
  return !t.tem_cobranca_asaas && (t.status === 'TRIAL' || (t.status === 'SUSPENSA' && t.motivo_status === 'TRIAL_EXPIRADO'))
}

// ── Prioridade comercial ─────────────────────────────────────────────────────
export const PRIORIDADES = ['alta', 'media', 'baixa'] as const
export type Prioridade = (typeof PRIORIDADES)[number]
export const PRIORIDADE_LABEL: Record<Prioridade, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' }

export interface Score { pontos: number; nivel: Prioridade | null; motivos: string[] }

/**
 * Oportunidade = sinal de intenção + uso real + urgência do prazo. Regra simples e explicável
 * (os motivos aparecem na tela). Cliente, perdido ou encerrado não entram (nivel = null).
 */
export function prioridade(t: Trial, now: Date = new Date()): Score {
  const f = fase(t, now)
  if (f === 'cliente' || f === 'encerrado' || t.lead?.status === 'perdido' || t.lead?.status === 'contratado') {
    return { pontos: 0, nivel: null, motivos: [] }
  }
  const a = t.atividade
  const m: Array<[number, string]> = []
  if (t.solicitou_contratacao_em) m.push([40, 'Pediu para contratar'])
  if (a.vendas_7d > 0) m.push([20, `${a.vendas_7d} venda(s) nos últimos 7 dias`])
  else if (a.vendas_total > 0) m.push([10, `${a.vendas_total} venda(s) no teste`])
  if (a.produtos_proprios >= 10) m.push([10, `${a.produtos_proprios} produtos cadastrados`])
  else if (a.produtos_proprios > 0) m.push([5, `${a.produtos_proprios} produto(s) cadastrado(s)`])
  if (a.ultimo_acesso && now.getTime() - new Date(a.ultimo_acesso).getTime() <= 3 * DIA) m.push([10, 'Acessou nos últimos 3 dias'])
  const dias = diasRestantes(t, now)
  if (f === 'expira_logo') m.push([15, dias <= 0 ? 'Teste termina hoje' : `Teste termina em ${dias} dia(s)`])
  if (f === 'expirado' && dias >= -7) m.push([15, 'Teste expirou há menos de 7 dias'])
  if (t.lead?.interesse === 'alto') m.push([20, 'Interesse alto'])
  if (t.lead?.interesse === 'medio') m.push([5, 'Interesse médio'])
  if (t.lead?.interesse === 'baixo') m.push([-10, 'Interesse baixo'])
  if (t.lead?.proximo_contato && t.lead.proximo_contato <= isoDate(now)) m.push([10, 'Retorno agendado para hoje ou atrasado'])
  if (!t.ultimo_contato_em && a.vendas_total === 0 && a.produtos_proprios === 0) m.push([0, 'Ainda sem uso: vale um contato de boas-vindas'])
  const pontos = m.reduce((s, [p]) => s + p, 0)
  return { pontos, nivel: pontos >= 50 ? 'alta' : pontos >= 25 ? 'media' : 'baixa', motivos: m.map(([, r]) => r) }
}

export function isoDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

// ── Lista: filtros, ordenação e indicadores ──────────────────────────────────
export interface TrialFilters { q: string; fase: Fase | null; prioridade: Prioridade | null }

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v)
const pick = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null)

export function parseTrialFilters(params: Record<string, string | string[] | undefined>): TrialFilters {
  return {
    q: String(first(params.q) ?? '').trim().slice(0, 60),
    fase: pick(FASES, first(params.fase)),
    prioridade: pick(PRIORIDADES, first(params.prioridade)),
  }
}

export type TrialRow = Trial & { fase: Fase; score: Score; dias: number }

export function listarTrials(trials: readonly Trial[], f: TrialFilters, now: Date = new Date()): TrialRow[] {
  const term = sanitizeSearch(f.q).toLowerCase()
  return trials
    .map((t) => ({ ...t, fase: fase(t, now), score: prioridade(t, now), dias: diasRestantes(t, now) }))
    .filter((t) => !f.fase || t.fase === f.fase)
    .filter((t) => !f.prioridade || t.score.nivel === f.prioridade)
    .filter((t) => !term || [t.empresa_nome, t.lead?.name, t.lead?.contact, t.lead?.email, t.lead?.protocol]
      .some((v) => v?.toLowerCase().includes(term)))
    // abertos primeiro, por pontos; empate: quem expira antes
    .sort((a, b) => Number(b.score.nivel !== null) - Number(a.score.nivel !== null) || b.score.pontos - a.score.pontos || a.trial_fim.localeCompare(b.trial_fim))
}

export interface TrialStats { emTeste: number; expiraLogo: number; pedidos: number; clientes: number; altaPrioridade: number; conversao: number }

export function trialStats(trials: readonly Trial[], now: Date = new Date()): TrialStats {
  let emTeste = 0, expiraLogo = 0, pedidos = 0, clientes = 0, alta = 0, encerrados = 0
  for (const t of trials) {
    const f = fase(t, now)
    if (f === 'em_teste' || f === 'expira_logo') emTeste++
    if (f === 'expira_logo') expiraLogo++
    if (f === 'cliente') clientes++
    if (f === 'cliente' || f === 'expirado' || f === 'encerrado') encerrados++
    if (t.solicitou_contratacao_em && f !== 'cliente') pedidos++
    if (prioridade(t, now).nivel === 'alta') alta++
  }
  return { emTeste, expiraLogo, pedidos, clientes, altaPrioridade: alta, conversao: encerrados ? Math.round((clientes / encerrados) * 100) : 0 }
}

// ── Valor de tabela (espelha internal.commercial_valor_tabela; o banco é a fonte da verdade) ──
export function valorTabela(planos: readonly Plano[], plano: string, addons: readonly string[], lojas: number, caixas: number): number | null {
  const p = planos.find((x) => x.codigo === plano && x.tipo === 'PLANO')
  if (!p) return null
  const l = Math.max(1, Math.floor(lojas))
  const c = Math.max(l, Math.floor(caixas))
  if (p.max_lojas !== null && l > p.max_lojas) return null
  let total = p.preco_loja_centavos * l + Math.max(0, c - p.caixas_inclusos_por_loja * l) * p.preco_caixa_adicional_centavos
  for (const a of new Set(addons)) {
    const ad = planos.find((x) => x.codigo === a && x.tipo === 'ADDON')
    if (!ad) return null
    total += ad.preco_loja_centavos * l
  }
  return total
}

export const formatBRL = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)

// ── Formulários ──────────────────────────────────────────────────────────────
export interface Conversao {
  empresaId: string; plano: string; addons: string[]; qtdLojas: number; qtdCaixas: number
  forma: Forma; valorCentavos: number | null; observacao: string
}

const int = (v: FormDataEntryValue | null) => (/^\d{1,4}$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : NaN)

/** Valor em reais digitado ("1.234,56", "150", "150.5") → centavos; vazio ⇒ null (usa a tabela). */
export function parseReais(raw: string): number | null | 'invalido' {
  const s = raw.trim().replace(/^R\$\s*/i, '')
  if (!s) return null
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(norm)) return 'invalido'
  return Math.round(Number(norm) * 100)
}

export function parseConversao(form: FormData, planos: readonly Plano[]): Parsed<Conversao> {
  const empresaId = form.get('empresaId')
  const plano = String(form.get('plano') ?? '')
  const addons = form.getAll('addons').map(String)
  const qtdLojas = int(form.get('qtdLojas'))
  const qtdCaixas = int(form.get('qtdCaixas'))
  const forma = pick(FORMAS, form.get('forma'))
  const valor = parseReais(String(form.get('valor') ?? ''))
  const observacao = String(form.get('observacao') ?? '').trim()
  if (!isUuid(empresaId)) return { ok: false, error: 'Empresa inválida.' }
  if (form.get('confirmo') !== 'sim') return { ok: false, error: 'Marque a confirmação de que você aprovou esta contratação.' }
  const p = planos.find((x) => x.codigo === plano && x.tipo === 'PLANO')
  if (!p) return { ok: false, error: 'Escolha um plano.' }
  if (addons.some((a) => !planos.some((x) => x.codigo === a && x.tipo === 'ADDON'))) return { ok: false, error: 'Add-on inválido.' }
  if (!Number.isInteger(qtdLojas) || qtdLojas < 1 || qtdLojas > 200) return { ok: false, error: 'Quantidade de lojas inválida (1 a 200).' }
  if (p.max_lojas !== null && qtdLojas > p.max_lojas) return { ok: false, error: `O plano ${p.nome} permite até ${p.max_lojas} loja(s).` }
  if (!Number.isInteger(qtdCaixas) || qtdCaixas < qtdLojas || qtdCaixas > 1000) return { ok: false, error: 'Caixas: no mínimo 1 por loja (até 1000).' }
  if (!forma) return { ok: false, error: 'Forma de pagamento inválida.' }
  if (valor === 'invalido') return { ok: false, error: 'Valor mensal inválido. Ex.: 179,90' }
  if (observacao.length < 5 || observacao.length > 1000) return { ok: false, error: 'Descreva as condições aprovadas (5 a 1000 caracteres).' }
  return { ok: true, value: { empresaId, plano, addons: [...new Set(addons)], qtdLojas, qtdCaixas, forma, valorCentavos: valor, observacao } }
}

export function parseFollowup(form: FormData, now: Date = new Date()): Parsed<{ empresaId: string; leadId: string; interesse: Interesse | null; proximo_contato: string | null }> {
  const empresaId = form.get('empresaId')
  const leadId = form.get('leadId')
  const rawInteresse = String(form.get('interesse') ?? '')
  const interesse = pick(INTERESSES, rawInteresse)
  const data = String(form.get('proximo_contato') ?? '').trim()
  if (!isUuid(empresaId) || !isUuid(leadId)) return { ok: false, error: 'Registro inválido.' }
  if (rawInteresse && !interesse) return { ok: false, error: 'Interesse inválido.' }
  if (data && (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data)))) return { ok: false, error: 'Data inválida.' }
  if (data && data < isoDate(new Date(now.getTime() - 365 * DIA))) return { ok: false, error: 'Data muito antiga.' }
  return { ok: true, value: { empresaId, leadId, interesse, proximo_contato: data || null } }
}

/** Erros da RPC (códigos do banco) → mensagem para a tela. */
export function mensagemConversao(code: string | undefined): string {
  const map: Record<string, string> = {
    COMMERCIAL_ACESSO_NEGADO: 'Sem permissão de administrador do hub.',
    COMMERCIAL_OBSERVACAO_OBRIGATORIA: 'Descreva as condições aprovadas.',
    COMMERCIAL_FORMA_INVALIDA: 'Forma de pagamento inválida.',
    COMMERCIAL_QUANTIDADE_INVALIDA: 'Quantidades inválidas (caixas ≥ lojas).',
    COMMERCIAL_NAO_E_TESTE: 'Esta empresa não veio do teste grátis.',
    COMMERCIAL_JA_CLIENTE: 'Esta empresa já é cliente pagante.',
    COMMERCIAL_STATUS_NAO_CONVERTIVEL: 'A assinatura não está em teste nem com teste expirado.',
    COMMERCIAL_TEM_COBRANCA_ASAAS: 'O cliente já tem assinatura no Asaas: trate pela cobrança, não por aqui.',
    COMMERCIAL_LOJAS_ATIVAS_ACIMA: 'A empresa já tem mais lojas ativas do que a quantidade contratada.',
    COMMERCIAL_VALOR_INVALIDO: 'Valor mensal inválido.',
    COBRANCA_PLANO_INVALIDO: 'Plano inválido ou inativo.',
    COBRANCA_ADDON_INVALIDO: 'Add-on inválido ou inativo.',
    PLANO_LIMITE_LOJAS: 'Esse plano não comporta tantas lojas.',
  }
  return (code && map[code]) || 'Não foi possível converter agora. Nada foi alterado.'
}
