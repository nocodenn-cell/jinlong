import 'server-only'
import type { HubConfig } from './config'
import type { Conversao, Interesse, Plano, Trial } from './conversao'
import type { ActivityWithLead, AuditRow, CatalogItem, DashActivity, DashLead, DashProposal, Member, NewLead, Papel, Proposal, ProposalInput, ProposalStatus, Stage, Activity } from './crm'
import { DEFAULT_STAGES, possiveisDuplicados } from './crm'
import { DEMO_ACTIVITIES, DEMO_AUDIT, DEMO_CUSTOMERS, DEMO_EVENTS, DEMO_LEADS, DEMO_MEMBERS, DEMO_PLANOS, DEMO_PROPOSALS, DEMO_TRIAL_EVENTS, DEMO_TRIALS } from './demoData'
import { CRM_LEAD_COLUMNS, filterLeads, leadsQuery, PAGE_SIZE, sanitizeSearch, type Customer, type Lead, type LeadEvent, type LeadFilters, type LeadStatus, type SubscriptionStatus } from './model'

const EVENT_COLUMNS = 'id,lead_id,kind,body,from_status,to_status,created_at,author'
const ACTIVITY_COLUMNS = 'id,lead_id,tipo,titulo,agendada_para,responsavel_id,concluida_em,cancelada_em,resultado,created_at'
const DASH_LEAD_COLUMNS = 'id,status,product,origem,created_at,utm_campaign,owner_id,primeiro_atendimento_em,motivo_perda,ultimo_contato_em,store,name,etapa_desde'
const CLOSED_WINDOW_DAYS = 30

export interface LeadDetail {
  lead: Lead
  events: LeadEvent[]
  customer: Customer | null
  activities: Activity[]
  proposals: Proposal[]
  duplicates: Lead[]
  audit: AuditRow[]
}

export interface DashSource { leads: DashLead[]; activities: DashActivity[]; proposals: DashProposal[] }

export interface PipelineSource { leads: Lead[]; proposals: DashProposal[]; pending: Pick<Activity, 'lead_id' | 'tipo' | 'agendada_para'>[] }

export interface Repo {
  // Central de Conversão (RPCs commercial_* com checagem is_commercial_admin no banco)
  listTrials(): Promise<Trial[]>
  getTrial(empresaId: string): Promise<{ trial: Trial; events: LeadEvent[] } | null>
  ensureTrialLead(empresaId: string): Promise<string>
  updateFollowup(leadId: string, v: { interesse: Interesse | null; proximo_contato: string | null }): Promise<void>
  listPlanos(): Promise<Plano[]>
  /** Catálogo oficial para vendedores (sem a checagem de gestor de commercial_planos). */
  listCatalogo(): Promise<CatalogItem[]>
  convertTrial(c: Conversao): Promise<{ valor_mensal_centavos: number; valor_tabela_centavos: number }>
  // Leads / funil
  listLeads(f: LeadFilters): Promise<Lead[]>
  listLeadsPage(f: LeadFilters, me: string): Promise<{ rows: Lead[]; total: number }>
  dashboardSource(f: LeadFilters, me: string): Promise<DashSource>
  pipelineSource(f: LeadFilters, me: string): Promise<PipelineSource>
  recentLeads(n: number): Promise<Lead[]>
  getLead(id: string): Promise<LeadDetail | null>
  changeStatus(id: string, to: LeadStatus, motivo?: string | null): Promise<void>
  addEvent(id: string, kind: 'nota' | 'contato', body: string): Promise<void>
  assignLead(id: string, owner: string | null): Promise<void>
  updateLead(id: string, dados: Record<string, unknown>): Promise<void>
  createLead(l: NewLead): Promise<string>
  // Agenda
  listAgenda(responsavel: string | null): Promise<ActivityWithLead[]>
  scheduleActivity(a: { leadId: string; tipo: string; titulo: string; quando: string; responsavel: string | null }): Promise<string>
  concludeActivity(id: string, resultado: string, cancelar: boolean): Promise<void>
  // Propostas e conversão
  createProposal(p: ProposalInput): Promise<string>
  setProposalStatus(id: string, status: ProposalStatus, motivo: string | null): Promise<void>
  convertLead(leadId: string, propostaId: string, observacao: string): Promise<string>
  // Clientes
  listCustomers(): Promise<Customer[]>
  updateCustomer(id: string, v: { plan: string | null; monthly_value: number | null; subscription_status: SubscriptionStatus }): Promise<void>
  // Equipe e etapas
  myRole(): Promise<Papel | null>
  listMembers(): Promise<Member[]>
  saveMember(m: { email: string; nome: string | null; papel: Papel; ativo: boolean }): Promise<void>
  listStages(): Promise<Stage[]>
  saveStage(s: { codigo: string; rotulo: string; ordem: number; ativo: boolean }): Promise<void>
  listAudit(limit: number): Promise<AuditRow[]>
}

/** Remove order/limit de uma query montada por leadsQuery; a paginação é feita por all(). */
function unpaged(qs: string): string {
  const p = new URLSearchParams(qs)
  p.delete('order')
  p.delete('limit')
  return p.toString()
}

export class RepoError extends Error {
  /** Código de regra de negócio levantado pelo banco (ex.: COMMERCIAL_JA_CLIENTE), quando houver. */
  constructor(message: string, readonly code?: string) { super(message) }
}

export function restRepo(cfg: HubConfig, token: string, fetchImpl: typeof fetch = fetch): Repo {
  async function raw(path: string, init: RequestInit = {}): Promise<Response> {
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
    return res
  }
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const text = await (await raw(path, init)).text()
    return (text ? JSON.parse(text) : null) as T
  }
  const rpc = <T>(fn: string, args: object = {}) => call<T>(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args), headers: { Prefer: '' } })
  const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
  const PAGE = 1000
  /** PostgREST corta cada resposta em api.max_rows (1000): lê em páginas até o fim, com ordem estável. */
  async function all<T>(base: string, order: string): Promise<T[]> {
    const out: T[] = []
    for (let offset = 0; offset < 100_000; offset += PAGE) {
      const page = await call<T[]>(`${base}&order=${order}&limit=${PAGE}&offset=${offset}`)
      out.push(...page)
      if (page.length < PAGE) break
    }
    return out
  }

  const repo: Repo = {
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
    listCatalogo: () => rpc<CatalogItem[]>('commercial_catalogo_planos'),
    convertTrial: (c) => rpc('commercial_converter_trial', {
      p_empresa: c.empresaId, p_plano: c.plano, p_addons: c.addons, p_qtd_lojas: c.qtdLojas, p_qtd_caixas: c.qtdCaixas,
      p_forma: c.forma, p_valor_centavos: c.valorCentavos, p_observacao: c.observacao,
    }),
    listLeads: (f) => call<Lead[]>(`commercial_leads?${leadsQuery(f)}`),
    async listLeadsPage(f, me) {
      const res = await raw(`commercial_leads?${leadsQuery(f, new Date(), { me, columns: CRM_LEAD_COLUMNS, paginate: true })}`, { headers: { Prefer: 'count=exact' } })
      const rows = (await res.json()) as Lead[]
      const total = Number(res.headers.get('content-range')?.split('/')[1] ?? rows.length)
      return { rows, total: Number.isFinite(total) ? total : rows.length }
    },
    async dashboardSource(f, me) {
      const leads = await all<DashLead>(`commercial_leads?${unpaged(leadsQuery({ ...f, q: '', status: null }, new Date(), { me, columns: DASH_LEAD_COLUMNS }))}`, 'id')
      const [activities, proposals] = await Promise.all([
        all<DashActivity>('commercial_activities?select=lead_id,tipo,agendada_para,concluida_em,cancelada_em&concluida_em=is.null&cancelada_em=is.null', 'id'),
        all<DashProposal>('commercial_proposals?select=lead_id,status,valor_mensal_centavos,enviada_em,versao', 'id'),
      ])
      return { leads, activities, proposals }
    },
    async pipelineSource(f, me) {
      const q = new URLSearchParams(unpaged(leadsQuery({ ...f, q: '', status: null, period: 'all' }, new Date(), { me, columns: CRM_LEAD_COLUMNS })))
      // em aberto: todos; encerrados: só os que mudaram de etapa nos últimos 30 dias
      q.append('or', `(status.not.in.(contratado,perdido),etapa_desde.gte.${since(CLOSED_WINDOW_DAYS)})`)
      const [leads, proposals, pending] = await Promise.all([
        all<Lead>(`commercial_leads?${q.toString()}`, 'id'),
        all<DashProposal>('commercial_proposals?select=lead_id,status,valor_mensal_centavos,enviada_em,versao&status=in.(enviada,em_negociacao)', 'id'),
        all<PipelineSource['pending'][number]>('commercial_activities?select=lead_id,tipo,agendada_para&concluida_em=is.null&cancelada_em=is.null', 'agendada_para.asc,id.asc'),
      ])
      return { leads, proposals, pending }
    },
    recentLeads: (n) => call<Lead[]>(`commercial_leads?select=${CRM_LEAD_COLUMNS}&order=created_at.desc&limit=${n}`),
    async getLead(id) {
      const [lead] = await call<Lead[]>(`commercial_leads?select=${CRM_LEAD_COLUMNS}&id=eq.${id}`)
      if (!lead) return null
      const dig = sanitizeSearch(lead.contact)
      const store = sanitizeSearch(lead.store)
      const ors = [store && `store.ilike.${store}`, dig && `contact.eq.${dig}`, lead.email && `email.eq.${sanitizeSearch(lead.email)}`].filter(Boolean)
      const [events, customers, activities, proposals, candidates, audit] = await Promise.all([
        call<LeadEvent[]>(`commercial_lead_events?select=${EVENT_COLUMNS}&lead_id=eq.${id}&order=created_at.desc&limit=300`),
        call<Customer[]>(`commercial_customers?select=*&lead_id=eq.${id}`),
        call<Activity[]>(`commercial_activities?select=${ACTIVITY_COLUMNS}&lead_id=eq.${id}&order=agendada_para.desc&limit=200`),
        call<Proposal[]>(`commercial_proposals?select=*&lead_id=eq.${id}&order=versao.desc`),
        ors.length ? call<Lead[]>(`commercial_leads?select=${CRM_LEAD_COLUMNS}&id=neq.${id}&or=(${ors.join(',')})&limit=10`) : Promise.resolve([] as Lead[]),
        call<AuditRow[]>(`commercial_audit?select=*&tabela=eq.commercial_leads&registro=eq.${id}&order=id.desc&limit=30`).catch(() => [] as AuditRow[]),
      ])
      return { lead, events, customer: customers[0] ?? null, activities, proposals, duplicates: possiveisDuplicados(lead, candidates), audit }
    },
    changeStatus: (id, to, motivo = null) => rpc('commercial_lead_mover', { p_lead: id, p_para: to, p_motivo: motivo }),
    addEvent: (id, kind, body) => call('commercial_lead_events', { method: 'POST', body: JSON.stringify({ lead_id: id, kind, body }) }),
    assignLead: (id, owner) => rpc('commercial_lead_atribuir', { p_lead: id, p_owner: owner }),
    updateLead: (id, dados) => rpc('commercial_lead_atualizar', { p_lead: id, p_dados: dados }),
    createLead: (l) => rpc<string>('commercial_lead_criar', {
      p_product: l.product, p_name: l.name, p_store: l.store, p_contact: l.contact, p_channel: l.channel, p_origem: l.origem,
      p_email: l.email, p_city: l.city, p_uf: l.uf, p_observacoes: l.observacoes, p_forcar: l.forcar,
    }),
    async listAgenda(responsavel) {
      const filtro = responsavel ? `&responsavel_id=eq.${responsavel}` : ''
      return all<ActivityWithLead>(`commercial_activities?select=${ACTIVITY_COLUMNS},lead:commercial_leads(id,store,name,status)&concluida_em=is.null&cancelada_em=is.null${filtro}`, 'agendada_para.asc,id.asc')
    },
    scheduleActivity: (a) => rpc<string>('commercial_atividade_agendar', { p_lead: a.leadId, p_tipo: a.tipo, p_titulo: a.titulo, p_quando: a.quando, p_responsavel: a.responsavel }),
    concludeActivity: (id, resultado, cancelar) => rpc('commercial_atividade_concluir', { p_id: id, p_resultado: resultado, p_cancelar: cancelar }),
    createProposal: (p) => rpc<string>('commercial_proposta_criar', {
      p_lead: p.leadId, p_plano: p.plano, p_addons: p.addons, p_qtd_lojas: p.qtdLojas, p_qtd_caixas: p.qtdCaixas,
      p_valor_centavos: p.valorCentavos, p_condicoes: p.condicoes, p_validade: p.validade,
    }),
    setProposalStatus: (id, status, motivo) => rpc('commercial_proposta_status', { p_id: id, p_status: status, p_motivo: motivo }),
    convertLead: (leadId, propostaId, observacao) => rpc<string>('commercial_lead_converter', { p_lead: leadId, p_proposta: propostaId, p_observacao: observacao }),
    listCustomers: () => call<Customer[]>('commercial_customers?select=*&order=contracted_at.desc'),
    updateCustomer: (id, v) => call(`commercial_customers?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(v) }),
    myRole: () => rpc<Papel | null>('commercial_meu_papel'),
    listMembers: () => rpc<Member[]>('commercial_equipe_listar'),
    saveMember: (m) => rpc('commercial_equipe_salvar', { p_email: m.email, p_nome: m.nome, p_papel: m.papel, p_ativo: m.ativo }),
    listStages: () => call<Stage[]>('commercial_stages?select=codigo,rotulo,ordem,tipo,sistema,ativo&order=ordem'),
    saveStage: (s) => rpc('commercial_etapa_salvar', { p_codigo: s.codigo, p_rotulo: s.rotulo, p_ordem: s.ordem, p_ativo: s.ativo }),
    listAudit: (limit) => call<AuditRow[]>(`commercial_audit?select=*&order=id.desc&limit=${Math.min(Math.max(1, limit), 500)}`),
  }
  return repo
}

/** Repositório em memória com dados FICTÍCIOS (somente HUB_DEMO_DATA=ficticio, fora de produção). */
export function demoRepo(): Repo {
  const leads = DEMO_LEADS
  const off = async (): Promise<never> => { throw new RepoError('Modo de dados fictícios: alterações desativadas.') }
  const pending = DEMO_ACTIVITIES.filter((a) => !a.concluida_em && !a.cancelada_em)
  const withLead = (a: Activity): ActivityWithLead => {
    const l = leads.find((x) => x.id === a.lead_id)
    return { ...a, lead: l ? { id: l.id, store: l.store, name: l.name, status: l.status } : null }
  }
  return {
    listTrials: async () => DEMO_TRIALS,
    async getTrial(empresaId) {
      const trial = DEMO_TRIALS.find((t) => t.empresa_id === empresaId)
      return trial ? { trial, events: DEMO_TRIAL_EVENTS.filter((e) => e.lead_id === trial.lead?.id) } : null
    },
    ensureTrialLead: off,
    updateFollowup: off,
    listPlanos: async () => DEMO_PLANOS,
    listCatalogo: async () => DEMO_PLANOS,
    convertTrial: off,
    listLeads: async (f) => filterLeads(leads, f),
    async listLeadsPage(f, me) {
      const all = filterLeads(leads, f, new Date(), me)
      const page = f.page ?? 1
      return { rows: all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: all.length }
    },
    dashboardSource: async (f, me) => ({ leads: filterLeads(leads, { ...f, q: '', status: null }, new Date(), me), activities: pending, proposals: DEMO_PROPOSALS }),
    async pipelineSource(f, me) {
      const lim = Date.now() - CLOSED_WINDOW_DAYS * 86_400_000
      const rows = filterLeads(leads, { ...f, q: '', status: null, period: 'all' }, new Date(), me)
        .filter((l) => !['contratado', 'perdido'].includes(l.status) || new Date(l.etapa_desde ?? l.updated_at).getTime() >= lim)
      return { leads: rows, proposals: DEMO_PROPOSALS.filter((p) => p.status === 'enviada' || p.status === 'em_negociacao'), pending }
    },
    recentLeads: async (n) => [...leads].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, n),
    async getLead(id) {
      const lead = leads.find((l) => l.id === id)
      if (!lead) return null
      return {
        lead,
        events: DEMO_EVENTS.filter((e) => e.lead_id === id),
        customer: DEMO_CUSTOMERS.find((c) => c.lead_id === id) ?? null,
        activities: DEMO_ACTIVITIES.filter((a) => a.lead_id === id),
        proposals: DEMO_PROPOSALS.filter((p) => p.lead_id === id),
        duplicates: possiveisDuplicados(lead, leads),
        audit: DEMO_AUDIT.filter((a) => a.registro === id),
      }
    },
    changeStatus: off,
    addEvent: off,
    assignLead: off,
    updateLead: off,
    createLead: off,
    listAgenda: async (resp) => pending.filter((a) => !resp || a.responsavel_id === resp).map(withLead),
    scheduleActivity: off,
    concludeActivity: off,
    createProposal: off,
    setProposalStatus: off,
    convertLead: off,
    listCustomers: async () => DEMO_CUSTOMERS,
    updateCustomer: off,
    myRole: async () => 'gestor',
    listMembers: async () => DEMO_MEMBERS,
    saveMember: off,
    listStages: async () => DEFAULT_STAGES,
    saveStage: off,
    listAudit: async () => DEMO_AUDIT,
  }
}

