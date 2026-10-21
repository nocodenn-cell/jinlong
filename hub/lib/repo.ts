import 'server-only'
import type { HubConfig } from './config'
import { DEMO_CUSTOMERS, DEMO_EVENTS, DEMO_LEADS } from './demoData'
import { filterLeads, LEAD_COLUMNS, leadsQuery, type Customer, type Lead, type LeadEvent, type LeadFilters, type LeadStatus, type SubscriptionStatus } from './model'

export interface Repo {
  listLeads(f: LeadFilters): Promise<Lead[]>
  statsSource(): Promise<Pick<Lead, 'status' | 'product' | 'created_at'>[]>
  recentLeads(n: number): Promise<Lead[]>
  getLead(id: string): Promise<{ lead: Lead; events: LeadEvent[]; customer: Customer | null } | null>
  changeStatus(id: string, to: LeadStatus): Promise<void>
  addEvent(id: string, kind: 'nota' | 'contato', body: string): Promise<void>
  listCustomers(): Promise<Customer[]>
  updateCustomer(id: string, v: { plan: string | null; monthly_value: number | null; subscription_status: SubscriptionStatus }): Promise<void>
}

export class RepoError extends Error {}

export function restRepo(cfg: HubConfig, token: string, fetchImpl: typeof fetch = fetch): Repo {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(`${cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...(init.headers ?? {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new RepoError(`Falha ao acessar dados (${res.status}).`)
    const text = await res.text()
    return (text ? JSON.parse(text) : null) as T
  }
  return {
    listLeads: (f) => call<Lead[]>(`commercial_leads?${leadsQuery(f)}`),
    statsSource: () => call(`commercial_leads?select=status,product,created_at&limit=10000`),
    recentLeads: (n) => call<Lead[]>(`commercial_leads?select=${LEAD_COLUMNS}&order=created_at.desc&limit=${n}`),
    async getLead(id) {
      const [lead] = await call<Lead[]>(`commercial_leads?select=${LEAD_COLUMNS}&id=eq.${id}`)
      if (!lead) return null
      const events = await call<LeadEvent[]>(`commercial_lead_events?select=id,lead_id,kind,body,from_status,to_status,created_at&lead_id=eq.${id}&order=created_at.desc`)
      const [customer] = await call<Customer[]>(`commercial_customers?select=*&lead_id=eq.${id}`)
      return { lead, events, customer: customer ?? null }
    },
    async changeStatus(id, to) {
      const [lead] = await call<Lead[]>(`commercial_leads?select=${LEAD_COLUMNS}&id=eq.${id}`)
      if (!lead) throw new RepoError('Lead não encontrado.')
      if (lead.status === to) return
      await call(`commercial_leads?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: to, updated_at: new Date().toISOString() }) })
      await call('commercial_lead_events', { method: 'POST', body: JSON.stringify({ lead_id: id, kind: 'status', from_status: lead.status, to_status: to }) })
      if (to === 'contratado') {
        await call('commercial_customers?on_conflict=lead_id', {
          method: 'POST',
          headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
          body: JSON.stringify({ lead_id: id, product: lead.product, store_name: lead.store, contact: lead.contact }),
        })
      }
    },
    addEvent: (id, kind, body) => call('commercial_lead_events', { method: 'POST', body: JSON.stringify({ lead_id: id, kind, body }) }),
    listCustomers: () => call<Customer[]>('commercial_customers?select=*&order=contracted_at.desc'),
    updateCustomer: (id, v) => call(`commercial_customers?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(v) }),
  }
}

/** Repositório em memória com dados FICTÍCIOS (somente HUB_DEMO_DATA=ficticio, fora de produção). */
export function demoRepo(): Repo {
  const leads = DEMO_LEADS
  return {
    listLeads: async (f) => filterLeads(leads, f),
    statsSource: async () => leads,
    recentLeads: async (n) => [...leads].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, n),
    async getLead(id) {
      const lead = leads.find((l) => l.id === id)
      if (!lead) return null
      return { lead, events: DEMO_EVENTS.filter((e) => e.lead_id === id), customer: DEMO_CUSTOMERS.find((c) => c.lead_id === id) ?? null }
    },
    changeStatus: async () => { throw new RepoError('Modo de dados fictícios: alterações desativadas.') },
    addEvent: async () => { throw new RepoError('Modo de dados fictícios: alterações desativadas.') },
    listCustomers: async () => DEMO_CUSTOMERS,
    updateCustomer: async () => { throw new RepoError('Modo de dados fictícios: alterações desativadas.') },
  }
}
