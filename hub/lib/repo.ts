import 'server-only'
import type { HubConfig } from './config'
import type { Conversao, Interesse, Plano, Trial } from './conversao'
import { DEMO_CUSTOMERS, DEMO_EVENTS, DEMO_LEADS, DEMO_PLANOS, DEMO_TRIAL_EVENTS, DEMO_TRIALS } from './demoData'
import { filterLeads, LEAD_COLUMNS, leadsQuery, type Customer, type Lead, type LeadEvent, type LeadFilters, type LeadStatus, type SubscriptionStatus } from './model'

const EVENT_COLUMNS = 'id,lead_id,kind,body,from_status,to_status,created_at'

export interface Repo {
  // Central de Conversão (RPCs commercial_* com checagem is_commercial_admin no banco)
  listTrials(): Promise<Trial[]>
  getTrial(empresaId: string): Promise<{ trial: Trial; events: LeadEvent[] } | null>
  ensureTrialLead(empresaId: string): Promise<string>
  updateFollowup(leadId: string, v: { interesse: Interesse | null; proximo_contato: string | null }): Promise<void>
  listPlanos(): Promise<Plano[]>
  convertTrial(c: Conversao): Promise<{ valor_mensal_centavos: number; valor_tabela_centavos: number }>
  listLeads(f: LeadFilters): Promise<Lead[]>
  statsSource(): Promise<Pick<Lead, 'status' | 'product' | 'created_at'>[]>
  recentLeads(n: number): Promise<Lead[]>
  getLead(id: string): Promise<{ lead: Lead; events: LeadEvent[]; customer: Customer | null } | null>
  changeStatus(id: string, to: LeadStatus): Promise<void>
  addEvent(id: string, kind: 'nota' | 'contato', body: string): Promise<void>
  listCustomers(): Promise<Customer[]>
  updateCustomer(id: string, v: { plan: string | null; monthly_value: number | null; subscription_status: SubscriptionStatus }): Promise<void>
}

export class RepoError extends Error {
  /** Código de regra de negócio levantado pelo banco (ex.: COMMERCIAL_JA_CLIENTE), quando houver. */
  constructor(message: string, readonly code?: string) { super(message) }
}

export function restRepo(cfg: HubConfig, token: string, fetchImpl: typeof fetch = fetch): Repo {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(`${cfg.url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...(init.headers ?? {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      const code = body?.message && /^[A-Z_]{4,60}$/.test(body.message) ? body.message : undefined
      throw new RepoError(`Falha ao acessar dados (${res.status}).`, code)
    }
    const text = await res.text()
    return (text ? JSON.parse(text) : null) as T
  }
  const rpc = <T>(fn: string, args: object = {}) => call<T>(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args), headers: { Prefer: '' } })
  return {
    listTrials: () => rpc<Trial[]>('commercial_trials_listar'),
    async getTrial(empresaId) {
      const [trial] = await rpc<Trial[]>('commercial_trials_listar', { p_empresa: empresaId })
      if (!trial) return null
      const events = trial.lead
        ? await call<LeadEvent[]>(`commercial_lead_events?select=${EVENT_COLUMNS}&lead_id=eq.${trial.lead.id}&order=created_at.desc&limit=200`)
        : []
      return { trial, events }
    },
    ensureTrialLead: (empresaId) => rpc<string>('commercial_trial_garantir_lead', { p_empresa: empresaId }),
    updateFollowup: (leadId, v) => call(`commercial_leads?id=eq.${leadId}`, { method: 'PATCH', body: JSON.stringify(v) }),
    listPlanos: () => rpc<Plano[]>('commercial_planos'),
    convertTrial: (c) => rpc('commercial_converter_trial', {
      p_empresa: c.empresaId, p_plano: c.plano, p_addons: c.addons, p_qtd_lojas: c.qtdLojas, p_qtd_caixas: c.qtdCaixas,
      p_forma: c.forma, p_valor_centavos: c.valorCentavos, p_observacao: c.observacao,
    }),
    listLeads: (f) => call<Lead[]>(`commercial_leads?${leadsQuery(f)}`),
    statsSource: () => call(`commercial_leads?select=status,product,created_at&limit=10000`),
    recentLeads: (n) => call<Lead[]>(`commercial_leads?select=${LEAD_COLUMNS}&order=created_at.desc&limit=${n}`),
    async getLead(id) {
      const [lead] = await call<Lead[]>(`commercial_leads?select=${LEAD_COLUMNS}&id=eq.${id}`)
      if (!lead) return null
      const events = await call<LeadEvent[]>(`commercial_lead_events?select=${EVENT_COLUMNS}&lead_id=eq.${id}&order=created_at.desc`)
      const [customer] = await call<Customer[]>(`commercial_customers?select=*&lead_id=eq.${id}`)
      return { lead, events, customer: customer ?? null }
    },
    async changeStatus(id, to) {
      const [lead] = await call<Lead[]>(`commercial_leads?select=${LEAD_COLUMNS}&id=eq.${id}`)
      if (!lead) throw new RepoError('Lead não encontrado.')
      if (lead.status === to) return
      // teste grátis vira cliente só pela Central (atualiza a assinatura com as regras de plano)
      if (to === 'contratado' && lead.origem === 'teste_gratis') throw new RepoError('Teste grátis: faça a conversão pela Central de Conversão.')
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
  const off = async (): Promise<never> => { throw new RepoError('Modo de dados fictícios: alterações desativadas.') }
  return {
    listTrials: async () => DEMO_TRIALS,
    async getTrial(empresaId) {
      const trial = DEMO_TRIALS.find((t) => t.empresa_id === empresaId)
      return trial ? { trial, events: DEMO_TRIAL_EVENTS.filter((e) => e.lead_id === trial.lead?.id) } : null
    },
    ensureTrialLead: off,
    updateFollowup: off,
    listPlanos: async () => DEMO_PLANOS,
    convertTrial: off,
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
