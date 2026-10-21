/** Modelo do hub comercial (sem dependências de servidor; testável). */

export const STATUSES = ['novo', 'contatado', 'demonstracao', 'proposta', 'contratado', 'perdido'] as const
export type LeadStatus = (typeof STATUSES)[number]
export const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: 'Novo',
  contatado: 'Contatado',
  demonstracao: 'Demonstração',
  proposta: 'Proposta',
  contratado: 'Contratado',
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

export interface Lead {
  id: string
  protocol: string
  product: Product
  name: string
  store: string
  contact: string
  channel: 'whatsapp' | 'wechat'
  locale: 'pt-BR' | 'zh-CN'
  status: LeadStatus
  created_at: string
  updated_at: string
}

export interface LeadEvent {
  id: string
  lead_id: string
  kind: 'nota' | 'contato' | 'status'
  body: string | null
  from_status: LeadStatus | null
  to_status: LeadStatus | null
  created_at: string
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

export interface LeadFilters {
  q: string
  status: LeadStatus | null
  product: Product | null
  period: Period
}

const pick = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null)
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v)

export function parseFilters(params: Record<string, string | string[] | undefined>): LeadFilters {
  const q = String(first(params.q) ?? '').trim().slice(0, 60)
  return {
    q,
    status: pick(STATUSES, first(params.status)),
    product: pick(PRODUCTS, first(params.product)),
    period: pick(PERIODS, first(params.period)) ?? '30d',
  }
}

export function periodStart(period: Period, now: Date = new Date()): Date | null {
  const days = { '7d': 7, '30d': 30, '90d': 90, all: 0 }[period]
  return days ? new Date(now.getTime() - days * 86_400_000) : null
}

/** Termo de busca seguro para o filtro or=(…ilike…) do PostgREST: remove separadores e curingas. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()*%\\:."']/g, ' ').replace(/\s+/g, ' ').trim()
}

export const LEAD_COLUMNS = 'id,protocol,product,name,store,contact,channel,locale,status,created_at,updated_at'

export function leadsQuery(f: LeadFilters, now: Date = new Date()): string {
  const p = new URLSearchParams({ select: LEAD_COLUMNS, order: 'created_at.desc', limit: '500' })
  if (f.status) p.set('status', `eq.${f.status}`)
  if (f.product) p.set('product', `eq.${f.product}`)
  const start = periodStart(f.period, now)
  if (start) p.set('created_at', `gte.${start.toISOString()}`)
  const term = sanitizeSearch(f.q)
  if (term) p.set('or', `(${['name', 'store', 'contact', 'protocol'].map((c) => `${c}.ilike.*${term}*`).join(',')})`)
  return p.toString()
}

/** Mesmo filtro aplicado em memória (dados fictícios e testes). */
export function filterLeads(leads: readonly Lead[], f: LeadFilters, now: Date = new Date()): Lead[] {
  const start = periodStart(f.period, now)
  const term = sanitizeSearch(f.q).toLowerCase()
  return leads
    .filter((l) => (!f.status || l.status === f.status) && (!f.product || l.product === f.product))
    .filter((l) => !start || new Date(l.created_at) >= start)
    .filter((l) => !term || [l.name, l.store, l.contact, l.protocol].some((v) => v.toLowerCase().includes(term)))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export interface Stats {
  total: number
  last7: number
  byStatus: Record<LeadStatus, number>
  byProduct: Record<Product, number>
  conversion: number
}

export function computeStats(leads: readonly Pick<Lead, 'status' | 'product' | 'created_at'>[], now: Date = new Date()): Stats {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>
  const byProduct = Object.fromEntries(PRODUCTS.map((p) => [p, 0])) as Record<Product, number>
  const since = now.getTime() - 7 * 86_400_000
  let last7 = 0
  for (const l of leads) {
    byStatus[l.status]++
    byProduct[l.product]++
    if (new Date(l.created_at).getTime() >= since) last7++
  }
  const closed = byStatus.contratado + byStatus.perdido
  return { total: leads.length, last7, byStatus, byProduct, conversion: closed ? Math.round((byStatus.contratado / closed) * 100) : 0 }
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

export function parseStatusChange(form: FormData): Parsed<{ leadId: string; status: LeadStatus }> {
  const leadId = form.get('leadId')
  const status = pick(STATUSES, form.get('status'))
  if (!isUuid(leadId)) return { ok: false, error: 'Lead inválido.' }
  if (!status) return { ok: false, error: 'Status inválido.' }
  return { ok: true, value: { leadId, status } }
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
