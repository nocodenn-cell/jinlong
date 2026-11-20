/** Modelo do hub comercial (sem dependências de servidor; testável). */

/**
 * Etapas do funil. A fonte da verdade é a tabela commercial_stages (configurável pelo gestor);
 * esta lista é só o padrão (rótulos de reserva e dados fictícios).
 */
export const STATUSES = ['novo', 'qualificacao', 'contatado', 'demonstracao', 'proposta', 'negociacao', 'contratado', 'perdido'] as const
export type LeadStatus = string
export const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo',
  qualificacao: 'Qualificação',
  contatado: 'Primeiro contato',
  demonstracao: 'Demonstração',
  proposta: 'Proposta enviada',
  negociacao: 'Negociação',
  contratado: 'Convertido',
  perdido: 'Perdido',
}

export const PRODUCTS = ['jinlong', 'venddi'] as const
export type Product = (typeof PRODUCTS)[number]
export const PRODUCT_LABEL: Record<Product, string> = { jinlong: 'Jinlong', venddi: 'Venddi' }

export const PERIODS = ['7d', '30d', '90d', 'all'] as const
export type Period = (typeof PERIODS)[number]
export const PERIOD_LABEL: Record<Period, string> = { '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', all: 'Todo o período' }

export const SUBSCRIPTION = ['ativo', 'pausado', 'cancelado'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION)[number]

export const ORIGENS = ['site', 'teste_gratis', 'indicacao', 'prospeccao', 'evento', 'whatsapp', 'outro'] as const
export type Origem = (typeof ORIGENS)[number]
export const ORIGEM_LABEL: Record<Origem, string> = {
  site: 'Site', teste_gratis: 'Teste grátis', indicacao: 'Indicação', prospeccao: 'Prospecção',
  evento: 'Evento', whatsapp: 'WhatsApp direto', outro: 'Outro',
}
/** Origens que a equipe pode escolher ao cadastrar manualmente (site/teste grátis são automáticas). */
export const ORIGENS_MANUAIS = ['indicacao', 'prospeccao', 'evento', 'whatsapp', 'outro'] as const

export interface Lead {
  id: string
  protocol: string
  product: Product
  name: string
  store: string
  contact: string
  channel: 'whatsapp' | 'wechat' | 'email'
  locale: 'pt-BR' | 'zh-CN'
  status: LeadStatus
  /** 'teste_gratis' = cadastro do /teste-gratis (ligado à empresa); conversão só pela Central. */
  origem: Origem
  empresa_id: string | null
  created_at: string
  updated_at: string
  // CRM (opcionais: ausentes em dados antigos/fictícios)
  email?: string | null
  phone?: string | null
  wechat?: string | null
  city?: string | null
  uf?: string | null
  segment?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  owner_id?: string | null
  funcionarios?: number | null
  unidades?: number | null
  observacoes?: string | null
  motivo_perda?: string | null
  interesse?: 'baixo' | 'medio' | 'alto' | null
  proximo_contato?: string | null
  primeiro_atendimento_em?: string | null
  ultimo_contato_em?: string | null
  etapa_desde?: string | null
}

export interface LeadEvent {
  id: string
  lead_id: string
  kind: 'nota' | 'contato' | 'status' | 'solicitacao' | 'conversao' | 'atribuicao' | 'edicao' | 'atividade' | 'proposta'
  body: string | null
  from_status: LeadStatus | null
  to_status: LeadStatus | null
  created_at: string
  author?: string | null
}

export interface Customer {
  id: string
  lead_id: string | null
  product: Product
  store_name: string
  contact: string | null
  contracted_at: string
  plan: string | null
  monthly_value: number | null
  subscription_status: SubscriptionStatus
  notes: string | null
}

/** Responsável: 'me' (eu), 'none' (sem responsável) ou o id do membro. */
export type OwnerFilter = 'me' | 'none' | string

export interface LeadFilters {
  q: string
  status: LeadStatus | null
  product: Product | null
  period: Period
  origem?: Origem | null
  owner?: OwnerFilter | null
  page?: number
}

export const PAGE_SIZE = 25

const pick = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null)
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v)
const STAGE_CODE = /^[a-z_]{3,30}$/

export function parseFilters(params: Record<string, string | string[] | undefined>): LeadFilters {
  const q = String(first(params.q) ?? '').trim().slice(0, 60)
  const status = first(params.status)
  const owner = String(first(params.owner) ?? '')
  const page = Number.parseInt(String(first(params.page) ?? '1'), 10)
  const f: LeadFilters = {
    q,
    status: typeof status === 'string' && STAGE_CODE.test(status) ? status : null,
    product: pick(PRODUCTS, first(params.product)),
    period: pick(PERIODS, first(params.period)) ?? '30d',
  }
  const origem = pick(ORIGENS, first(params.origem))
  if (origem) f.origem = origem
  if (owner === 'me' || owner === 'none' || isUuid(owner)) f.owner = owner
  if (Number.isFinite(page) && page > 1) f.page = Math.min(page, 1000)
  return f
}

export function periodStart(period: Period, now: Date = new Date()): Date | null {
  const days = { '7d': 7, '30d': 30, '90d': 90, all: 0 }[period]
  return days ? new Date(now.getTime() - days * 86_400_000) : null
}

/** Termo de busca seguro para o filtro or=(…ilike…) do PostgREST: remove separadores e curingas. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\:."']/g, ' ').replace(/\s+/g, ' ').trim()
}

export const LEAD_COLUMNS = 'id,protocol,product,name,store,contact,channel,locale,status,origem,empresa_id,created_at,updated_at'
export const CRM_LEAD_COLUMNS = `${LEAD_COLUMNS},email,phone,wechat,city,uf,segment,utm_source,utm_medium,utm_campaign,owner_id,funcionarios,unidades,observacoes,motivo_perda,interesse,proximo_contato,primeiro_atendimento_em,ultimo_contato_em,etapa_desde`
const SEARCH_COLUMNS = ['name', 'store', 'contact', 'protocol', 'email', 'city']

/** Query do PostgREST. `me` é o id do usuário logado (para owner=me). Sem paginação quando page ausente. */
export function leadsQuery(f: LeadFilters, now: Date = new Date(), opts: { me?: string; columns?: string; paginate?: boolean } = {}): string {
  const p = new URLSearchParams({ select: opts.columns ?? LEAD_COLUMNS, order: 'created_at.desc', limit: opts.paginate ? String(PAGE_SIZE) : '500' })
  if (opts.paginate) p.set('offset', String(((f.page ?? 1) - 1) * PAGE_SIZE))
  if (f.status) p.set('status', `eq.${f.status}`)
  if (f.product) p.set('product', `eq.${f.product}`)
  if (f.origem) p.set('origem', `eq.${f.origem}`)
  if (f.owner === 'none') p.set('owner_id', 'is.null')
  else if (f.owner === 'me' && opts.me) p.set('owner_id', `eq.${opts.me}`)
  else if (f.owner && isUuid(f.owner)) p.set('owner_id', `eq.${f.owner}`)
  const start = periodStart(f.period, now)
  if (start) p.set('created_at', `gte.${start.toISOString()}`)
  const term = sanitizeSearch(f.q)
  const cols = opts.columns ? SEARCH_COLUMNS : SEARCH_COLUMNS.slice(0, 4)
  if (term) p.set('or', `(${cols.map((c) => `${c}.ilike.*${term}*`).join(',')})`)
  return p.toString()
}

/** Mesmo filtro aplicado em memória (dados fictícios e testes). */
export function filterLeads(leads: readonly Lead[], f: LeadFilters, now: Date = new Date(), me?: string): Lead[] {
  const start = periodStart(f.period, now)
  const term = sanitizeSearch(f.q).toLowerCase()
  return leads
    .filter((l) => (!f.status || l.status === f.status) && (!f.product || l.product === f.product) && (!f.origem || l.origem === f.origem))
    .filter((l) => !f.owner || (f.owner === 'none' ? !l.owner_id : l.owner_id === (f.owner === 'me' ? me : f.owner)))
    .filter((l) => !start || new Date(l.created_at) >= start)
    .filter((l) => !term || [l.name, l.store, l.contact, l.protocol, l.email ?? '', l.city ?? ''].some((v) => v.toLowerCase().includes(term)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export interface Stats {
  total: number
  last7: number
  byStatus: Record<string, number>
  byProduct: Record<Product, number>
  conversion: number
}

export function computeStats(leads: readonly Pick<Lead, 'status' | 'product' | 'created_at'>[], now: Date = new Date()): Stats {
  const byStatus: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]))
  const byProduct = Object.fromEntries(PRODUCTS.map((p) => [p, 0])) as Record<Product, number>
  const since = now.getTime() - 7 * 86_400_000
  let last7 = 0
  for (const l of leads) {
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1
    byProduct[l.product]++
    if (new Date(l.created_at).getTime() >= since) last7++
  }
  const closed = (byStatus.contratado ?? 0) + (byStatus.perdido ?? 0)
  return { total: leads.length, last7, byStatus, byProduct, conversion: closed ? Math.round(((byStatus.contratado ?? 0) / closed) * 100) : 0 }
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

export function parseNote(form: FormData): Parsed<{ leadId: string; kind: 'nota' | 'contato'; body: string }> {
  const leadId = form.get('leadId')
  const kind = form.get('kind')
  const body = String(form.get('body') ?? '').trim()
  if (!isUuid(leadId)) return { ok: false, error: 'Lead inválido.' }
  if (kind !== 'nota' && kind !== 'contato') return { ok: false, error: 'Tipo inválido.' }
  if (body.length < 2 || body.length > 2000) return { ok: false, error: 'Escreva entre 2 e 2000 caracteres.' }
  return { ok: true, value: { leadId, kind, body } }
}

/** Mudança de etapa. A regra (transição válida, motivo de perda) é do banco; aqui só o formato. */
export function parseStatusChange(form: FormData): Parsed<{ leadId: string; status: LeadStatus; motivo: string | null }> {
  const leadId = form.get('leadId')
  const status = form.get('status')
  const motivo = String(form.get('motivo') ?? '').trim()
  if (!isUuid(leadId)) return { ok: false, error: 'Lead inválido.' }
  if (typeof status !== 'string' || !STAGE_CODE.test(status)) return { ok: false, error: 'Etapa inválida.' }
  if (motivo.length > 500) return { ok: false, error: 'Motivo muito longo (até 500 caracteres).' }
  return { ok: true, value: { leadId, status, motivo: motivo || null } }
}

export function parseCustomerUpdate(form: FormData): Parsed<{ id: string; plan: string | null; monthly_value: number | null; subscription_status: SubscriptionStatus }> {
  const id = form.get('id')
  const plan = String(form.get('plan') ?? '').trim()
  const rawValue = String(form.get('monthly_value') ?? '').trim().replace(',', '.')
  const sub = pick(SUBSCRIPTION, form.get('subscription_status'))
  if (!isUuid(id)) return { ok: false, error: 'Cliente inválido.' }
  if (!sub) return { ok: false, error: 'Situação inválida.' }
  if (plan.length > 60) return { ok: false, error: 'Plano muito longo.' }
  const value = rawValue === '' ? null : Number(rawValue)
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1_000_000)) return { ok: false, error: 'Valor inválido.' }
  return { ok: true, value: { id, plan: plan || null, monthly_value: value === null ? null : Math.round(value * 100) / 100, subscription_status: sub } }
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso))
}

export const CHANNEL_LABEL: Record<Lead['channel'], string> = { whatsapp: 'WhatsApp', wechat: 'WeChat', email: 'E-mail' }

export const EVENT_LABEL: Record<LeadEvent['kind'], string> = {
  nota: 'Nota', contato: 'Contato realizado', status: 'Mudança de etapa',
  solicitacao: 'Pedido de contratação (pelo cliente)', conversao: 'Conversão em cliente',
  atribuicao: 'Responsável', edicao: 'Dados atualizados', atividade: 'Agenda', proposta: 'Proposta',
}
