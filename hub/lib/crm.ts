/** Central Comercial (CRM-001): tipos, validação de formulários, indicadores e alertas. Puro; testável. */
import { isUuid, ORIGEM_LABEL, ORIGENS_MANUAIS, PRODUCTS, STATUS_LABEL, type Lead, type Origem, type Parsed, type Product } from './model'

export type Papel = 'gestor' | 'vendedor'

export interface Stage {
  codigo: string
  rotulo: string
  ordem: number
  tipo: 'aberta' | 'ganha' | 'perdida'
  sistema: boolean
  ativo: boolean
}

/** Item do catálogo oficial (saas.planos) visível a qualquer membro. */
export interface CatalogItem {
  codigo: string
  nome: string
  tipo: 'PLANO' | 'ADDON'
  preco_loja_centavos: number
  preco_placeholder: boolean
}

export interface Member {
  user_id: string
  nome: string
  papel: Papel
  ativo: boolean
  email: string | null
}

export const ACTIVITY_TYPES = ['ligacao', 'reuniao', 'demonstracao', 'retorno', 'tarefa', 'prazo'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]
export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  ligacao: 'Ligação', reuniao: 'Reunião', demonstracao: 'Demonstração', retorno: 'Retorno', tarefa: 'Tarefa', prazo: 'Prazo',
}

export interface Activity {
  id: string
  lead_id: string
  tipo: ActivityType
  titulo: string
  agendada_para: string
  responsavel_id: string | null
  concluida_em: string | null
  cancelada_em: string | null
  resultado: string | null
  created_at: string
}
export type ActivityWithLead = Activity & { lead: Pick<Lead, 'id' | 'store' | 'name' | 'status'> | null }

export const PROPOSAL_STATUSES = ['rascunho', 'enviada', 'em_negociacao', 'aceita', 'recusada', 'expirada', 'cancelada'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]
export const PROPOSAL_LABEL: Record<ProposalStatus, string> = {
  rascunho: 'Rascunho', enviada: 'Enviada', em_negociacao: 'Em negociação', aceita: 'Aceita',
  recusada: 'Recusada', expirada: 'Expirada', cancelada: 'Cancelada',
}
/** Espelho das transições do banco (commercial_proposta_status), só para mostrar os botões certos. */
export const PROPOSAL_NEXT: Record<ProposalStatus, ProposalStatus[]> = {
  rascunho: ['enviada', 'cancelada'],
  enviada: ['em_negociacao', 'recusada', 'expirada', 'cancelada'],
  em_negociacao: ['enviada', 'recusada', 'expirada', 'cancelada'],
  aceita: [], recusada: [], expirada: [], cancelada: [],
}
export const PROPOSAL_ABERTA = (s: ProposalStatus) => s === 'enviada' || s === 'em_negociacao'

export interface Proposal {
  id: string
  lead_id: string
  versao: number
  plano_codigo: string | null
  addons: string[]
  qtd_lojas: number | null
  qtd_caixas: number | null
  valor_tabela_centavos: number | null
  preco_tabela_provisorio: boolean
  valor_mensal_centavos: number
  condicoes: string | null
  validade: string
  status: ProposalStatus
  enviada_em: string | null
  decidida_em: string | null
  motivo: string | null
  created_at: string
}

export interface AuditRow {
  id: number
  tabela: string
  registro: string
  acao: 'INSERT' | 'UPDATE' | 'DELETE'
  ator: string | null
  campos: string[]
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  criado_em: string
}

export const DEFAULT_STAGES: Stage[] = [
  ['novo', 10, 'aberta', true], ['qualificacao', 20, 'aberta', false], ['contatado', 30, 'aberta', false],
  ['demonstracao', 40, 'aberta', false], ['proposta', 50, 'aberta', true], ['negociacao', 60, 'aberta', true],
  ['contratado', 90, 'ganha', true], ['perdido', 99, 'perdida', true],
].map(([codigo, ordem, tipo, sistema]) => ({ codigo: codigo as string, rotulo: STATUS_LABEL[codigo as string] ?? String(codigo), ordem: ordem as number, tipo: tipo as Stage['tipo'], sistema: sistema as boolean, ativo: true }))

export const stageLabel = (stages: readonly Stage[], codigo: string) => stages.find((s) => s.codigo === codigo)?.rotulo ?? STATUS_LABEL[codigo] ?? codigo
export const stageTipo = (stages: readonly Stage[], codigo: string): Stage['tipo'] => stages.find((s) => s.codigo === codigo)?.tipo ?? (codigo === 'contratado' ? 'ganha' : codigo === 'perdido' ? 'perdida' : 'aberta')
export const sortedStages = (stages: readonly Stage[]) => [...stages].sort((a, b) => a.ordem - b.ordem)
export const memberName = (members: readonly Member[], id: string | null | undefined) => (id ? members.find((m) => m.user_id === id)?.nome ?? 'Membro da equipe' : 'Sem responsável')

// ── Formulários ──────────────────────────────────────────────────────────────
const str = (form: FormData, k: string) => String(form.get(k) ?? '').trim()
const optStr = (form: FormData, k: string) => str(form, k) || null
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/
const PHONE = /^[0-9+() .-]{8,25}$/
const UF = /^[A-Z]{2}$/
const CTRL = /[\u0000-\u001f\u007f<>]/

function optInt(raw: string, max: number): number | null | 'invalido' {
  if (raw === '') return null
  if (!/^\d{1,6}$/.test(raw)) return 'invalido'
  const n = Number(raw)
  return n <= max ? n : 'invalido'
}

export interface LeadUpdate {
  leadId: string
  dados: { name: string; store: string; contact: string; email: string | null; phone: string | null; city: string | null; uf: string | null; segment: string | null; funcionarios: number | null; unidades: number | null; observacoes: string | null; proximo_contato: string | null }
}

export function parseLeadUpdate(form: FormData): Parsed<LeadUpdate> {
  const leadId = form.get('leadId')
  if (!isUuid(leadId)) return { ok: false, error: 'Lead inválido.' }
  const name = str(form, 'name'), store = str(form, 'store'), contact = str(form, 'contact')
  if (name.length < 2 || name.length > 80 || CTRL.test(name)) return { ok: false, error: 'Nome: entre 2 e 80 caracteres.' }
  if (store.length < 2 || store.length > 120 || CTRL.test(store)) return { ok: false, error: 'Empresa/loja: entre 2 e 120 caracteres.' }
  if (contact.length < 3 || contact.length > 60 || CTRL.test(contact)) return { ok: false, error: 'Contato: entre 3 e 60 caracteres.' }
  const email = optStr(form, 'email')?.toLowerCase() ?? null
  if (email && (!EMAIL.test(email) || email.length > 254)) return { ok: false, error: 'E-mail inválido.' }
  const phone = optStr(form, 'phone')
  if (phone && !PHONE.test(phone)) return { ok: false, error: 'Telefone inválido (só números, espaço, +, -, parênteses).' }
  const city = optStr(form, 'city')
  if (city && (city.length < 2 || city.length > 80 || CTRL.test(city))) return { ok: false, error: 'Cidade: entre 2 e 80 caracteres.' }
  const uf = optStr(form, 'uf')?.toUpperCase() ?? null
  if (uf && !UF.test(uf)) return { ok: false, error: 'UF: duas letras (ex.: SP).' }
  const segment = optStr(form, 'segment')
  if (segment && !['importados', 'eletronicos', 'utilidades', 'atacado', 'moda', 'outro'].includes(segment)) return { ok: false, error: 'Segmento inválido.' }
  const funcionarios = optInt(str(form, 'funcionarios'), 100000)
  const unidades = optInt(str(form, 'unidades'), 10000)
  if (funcionarios === 'invalido' || unidades === 'invalido') return { ok: false, error: 'Funcionários/unidades: número inteiro.' }
  const observacoes = optStr(form, 'observacoes')
  if (observacoes && observacoes.length > 4000) return { ok: false, error: 'Observações: até 4000 caracteres.' }
  const proximo = optStr(form, 'proximo_contato')
  if (proximo && !/^\d{4}-\d{2}-\d{2}$/.test(proximo)) return { ok: false, error: 'Data do próximo contato inválida.' }
  return { ok: true, value: { leadId, dados: { name, store, contact, email, phone, city, uf, segment, funcionarios, unidades, observacoes, proximo_contato: proximo } } }
}

export interface NewLead {
  product: Product; name: string; store: string; contact: string; channel: 'whatsapp' | 'wechat' | 'email'
  origem: (typeof ORIGENS_MANUAIS)[number]; email: string | null; city: string | null; uf: string | null; observacoes: string | null; forcar: boolean
}

export function parseNewLead(form: FormData): Parsed<NewLead> {
  const product = str(form, 'product') as Product
  const channel = str(form, 'channel')
  const origem = str(form, 'origem')
  if (!(PRODUCTS as readonly string[]).includes(product)) return { ok: false, error: 'Produto inválido.' }
  if (!['whatsapp', 'wechat', 'email'].includes(channel)) return { ok: false, error: 'Canal inválido.' }
  if (!(ORIGENS_MANUAIS as readonly string[]).includes(origem)) return { ok: false, error: 'Origem inválida.' }
  const base = new FormData()
  for (const k of ['name', 'store', 'contact', 'email', 'city', 'uf', 'observacoes']) base.set(k, str(form, k))
  base.set('leadId', '00000000-0000-4000-8000-000000000000')
  const p = parseLeadUpdate(base)
  if (!p.ok) return p
  const d = p.value.dados
  if (channel === 'email' && !EMAIL.test(d.contact)) return { ok: false, error: 'Canal e-mail: o contato precisa ser um e-mail.' }
  return {
    ok: true,
    value: { product, name: d.name, store: d.store, contact: d.contact, channel: channel as NewLead['channel'], origem: origem as NewLead['origem'], email: d.email, city: d.city, uf: d.uf, observacoes: d.observacoes, forcar: form.get('forcar') === 'on' },
  }
}

export function parseAssign(form: FormData): Parsed<{ leadId: string; owner: string | null }> {
  const leadId = form.get('leadId')
  const owner = str(form, 'owner')
  if (!isUuid(leadId)) return { ok: false, error: 'Lead inválido.' }
  if (owner && !isUuid(owner)) return { ok: false, error: 'Responsável inválido.' }
  return { ok: true, value: { leadId, owner: owner || null } }
}

/** Data/hora local (America/Sao_Paulo, sem horário de verão desde 2019) → ISO UTC. */
export function localToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const d = new Date(`${date}T${time}:00-03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function parseActivity(form: FormData, now: Date = new Date()): Parsed<{ leadId: string; tipo: ActivityType; titulo: string; quando: string; responsavel: string | null }> {
  const leadId = form.get('leadId')
  const tipo = str(form, 'tipo') as ActivityType
  const titulo = str(form, 'titulo')
  const quando = localToIso(str(form, 'data'), str(form, 'hora') || '09:00')
  const responsavel = str(form, 'responsavel')
  if (!isUuid(leadId)) return { ok: false, error: 'Lead inválido.' }
  if (!(ACTIVITY_TYPES as readonly string[]).includes(tipo)) return { ok: false, error: 'Tipo de atividade inválido.' }
  if (titulo.length < 2 || titulo.length > 120 || CTRL.test(titulo)) return { ok: false, error: 'Título: entre 2 e 120 caracteres.' }
  if (!quando) return { ok: false, error: 'Data e hora inválidas.' }
  const t = new Date(quando).getTime()
  if (t < now.getTime() - 86_400_000 || t > now.getTime() + 365 * 86_400_000) return { ok: false, error: 'Data fora do intervalo (até 1 ano à frente).' }
  if (responsavel && !isUuid(responsavel)) return { ok: false, error: 'Responsável inválido.' }
  return { ok: true, value: { leadId, tipo, titulo, quando, responsavel: responsavel || null } }
}

export function parseConclude(form: FormData): Parsed<{ id: string; resultado: string; cancelar: boolean }> {
  const id = form.get('id')
  const resultado = str(form, 'resultado')
  if (!isUuid(id)) return { ok: false, error: 'Atividade inválida.' }
  if (resultado.length < 2 || resultado.length > 2000) return { ok: false, error: 'Descreva o resultado (2 a 2000 caracteres).' }
  return { ok: true, value: { id, resultado, cancelar: form.get('cancelar') === '1' } }
}

export interface ProposalInput {
  leadId: string; plano: string | null; addons: string[]; qtdLojas: number | null; qtdCaixas: number | null
  valorCentavos: number | null; condicoes: string | null; validade: string
}

export function parseProposal(form: FormData, planosValidos: readonly string[], addonsValidos: readonly string[], now: Date = new Date()): Parsed<ProposalInput> {
  const leadId = form.get('leadId')
  if (!isUuid(leadId)) return { ok: false, error: 'Lead inválido.' }
  const plano = str(form, 'plano') || null
  if (plano && !planosValidos.includes(plano)) return { ok: false, error: 'Plano inexistente no catálogo oficial.' }
  const addons = form.getAll('addons').map(String)
  if (addons.some((a) => !addonsValidos.includes(a))) return { ok: false, error: 'Adicional inexistente no catálogo oficial.' }
  if (!plano && addons.length) return { ok: false, error: 'Adicionais exigem um plano.' }
  const lojas = optInt(str(form, 'qtd_lojas'), 200), caixas = optInt(str(form, 'qtd_caixas'), 1000)
  if (lojas === 'invalido' || caixas === 'invalido' || lojas === 0 || caixas === 0) return { ok: false, error: 'Quantidades inválidas.' }
  if (lojas !== null && caixas !== null && caixas < lojas) return { ok: false, error: 'Caixas não pode ser menor que lojas.' }
  const raw = str(form, 'valor').replace(/\./g, '').replace(',', '.')
  let valor: number | null = null
  if (raw) {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { ok: false, error: 'Valor mensal inválido.' }
    valor = Math.round(n * 100)
  }
  if (!plano && valor === null) return { ok: false, error: 'Sem plano do catálogo, informe o valor negociado.' }
  const validade = str(form, 'validade')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validade)) return { ok: false, error: 'Validade inválida.' }
  const hoje = now.toISOString().slice(0, 10)
  const lim = new Date(now.getTime() + 180 * 86_400_000).toISOString().slice(0, 10)
  if (validade < hoje || validade > lim) return { ok: false, error: 'Validade entre hoje e 180 dias.' }
  const condicoes = optStr(form, 'condicoes')
  if (condicoes && condicoes.length > 2000) return { ok: false, error: 'Condições: até 2000 caracteres.' }
  return { ok: true, value: { leadId, plano, addons, qtdLojas: lojas, qtdCaixas: caixas, valorCentavos: valor, condicoes, validade } }
}

export function parseProposalStatus(form: FormData): Parsed<{ id: string; leadId: string; status: ProposalStatus; motivo: string | null }> {
  const id = form.get('id'), leadId = form.get('leadId')
  const status = str(form, 'status') as ProposalStatus
  const motivo = optStr(form, 'motivo')
  if (!isUuid(id) || !isUuid(leadId)) return { ok: false, error: 'Proposta inválida.' }
  if (!(PROPOSAL_STATUSES as readonly string[]).includes(status) || status === 'aceita') return { ok: false, error: 'Situação inválida (aceite só pela conversão).' }
  if (motivo && motivo.length > 500) return { ok: false, error: 'Motivo: até 500 caracteres.' }
  return { ok: true, value: { id, leadId, status, motivo } }
}

export function parseConvert(form: FormData): Parsed<{ leadId: string; propostaId: string; observacao: string }> {
  const leadId = form.get('leadId'), propostaId = form.get('propostaId')
  const observacao = str(form, 'observacao')
  if (!isUuid(leadId) || !isUuid(propostaId)) return { ok: false, error: 'Escolha a proposta aceita pelo cliente.' }
  if (form.get('confirmo') !== 'on') return { ok: false, error: 'Confirme que o cliente aceitou a proposta.' }
  if (observacao.length < 5 || observacao.length > 1000) return { ok: false, error: 'Registre como foi o aceite (5 a 1000 caracteres).' }
  return { ok: true, value: { leadId, propostaId, observacao } }
}

export function parseMember(form: FormData): Parsed<{ email: string; nome: string | null; papel: Papel; ativo: boolean }> {
  const email = str(form, 'email').toLowerCase()
  const nome = optStr(form, 'nome')
  const papel = str(form, 'papel')
  if (!EMAIL.test(email)) return { ok: false, error: 'E-mail inválido.' }
  if (nome && (nome.length < 2 || nome.length > 80 || CTRL.test(nome))) return { ok: false, error: 'Nome: entre 2 e 80 caracteres.' }
  if (papel !== 'gestor' && papel !== 'vendedor') return { ok: false, error: 'Papel inválido.' }
  return { ok: true, value: { email, nome, papel, ativo: form.get('ativo') !== '0' } }
}

export function parseStage(form: FormData): Parsed<{ codigo: string; rotulo: string; ordem: number; ativo: boolean }> {
  const rotulo = str(form, 'rotulo')
  const codigo = str(form, 'codigo') || rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '').slice(0, 30)
  const ordem = Number.parseInt(str(form, 'ordem'), 10)
  if (!/^[a-z_]{3,30}$/.test(codigo)) return { ok: false, error: 'Nome da etapa inválido.' }
  if (rotulo.length < 2 || rotulo.length > 40 || CTRL.test(rotulo)) return { ok: false, error: 'Nome: entre 2 e 40 caracteres.' }
  if (!Number.isInteger(ordem) || ordem < 0 || ordem > 100) return { ok: false, error: 'Ordem inválida.' }
  return { ok: true, value: { codigo, rotulo, ordem, ativo: form.get('ativo') !== '0' } }
}

// ── Mensagens dos códigos de regra do banco ─────────────────────────────────
const MENSAGENS: Record<string, string> = {
  COMMERCIAL_ACESSO_NEGADO: 'Seu papel não permite esta ação.',
  COMMERCIAL_LEAD_NAO_ENCONTRADO: 'Lead não encontrado (ou não está atribuído a você).',
  COMMERCIAL_ETAPA_INVALIDA: 'Etapa inexistente ou desativada.',
  COMMERCIAL_LEAD_CONVERTIDO: 'Lead já convertido: a etapa não muda mais.',
  COMMERCIAL_USE_CONVERSAO: 'Para “Convertido”, use a conversão (exige proposta aceita).',
  COMMERCIAL_MOTIVO_PERDA_OBRIGATORIO: 'Informe o motivo da perda (3 a 500 caracteres).',
  COMMERCIAL_MOTIVO_REABERTURA_OBRIGATORIO: 'Para reabrir um lead perdido, informe o motivo.',
  COMMERCIAL_RESPONSAVEL_INVALIDO: 'Responsável inexistente ou inativo.',
  COMMERCIAL_CAMPO_INVALIDO: 'Algum campo está em formato inválido.',
  COMMERCIAL_CAMPO_OBRIGATORIO: 'Nome, empresa e contato são obrigatórios.',
  COMMERCIAL_ORIGEM_INVALIDA: 'Origem inválida.',
  COMMERCIAL_LEAD_DUPLICADO: 'Já existe um lead com este contato ou e-mail. Procure-o na lista ou marque “criar mesmo assim”.',
  COMMERCIAL_LEAD_ENCERRADO: 'Lead encerrado (convertido ou perdido).',
  COMMERCIAL_DATA_INVALIDA: 'Data fora do intervalo permitido.',
  COMMERCIAL_ATIVIDADE_NAO_ENCONTRADA: 'Atividade não encontrada.',
  COMMERCIAL_ATIVIDADE_ENCERRADA: 'Atividade já concluída ou cancelada.',
  COMMERCIAL_RESULTADO_OBRIGATORIO: 'Descreva o resultado.',
  COMMERCIAL_VALIDADE_INVALIDA: 'Validade entre hoje e 180 dias (proposta vencida não pode ser enviada).',
  COMMERCIAL_VALOR_OBRIGATORIO: 'Sem plano do catálogo, informe o valor negociado.',
  COBRANCA_PLANO_INVALIDO: 'Plano ou adicional inexistente no catálogo oficial.',
  COBRANCA_ADDON_INVALIDO: 'Adicional inexistente no catálogo oficial.',
  PLANO_LIMITE_LOJAS: 'Quantidade de lojas acima do limite do plano.',
  COMMERCIAL_PROPOSTA_NAO_ENCONTRADA: 'Proposta não encontrada.',
  COMMERCIAL_TRANSICAO_PROPOSTA_INVALIDA: 'Essa mudança de situação da proposta não é permitida.',
  COMMERCIAL_USE_CENTRAL: 'Teste grátis: converta pela Central de Conversão (ajusta a assinatura).',
  COMMERCIAL_JA_CLIENTE: 'Este lead já é cliente.',
  COMMERCIAL_OBSERVACAO_OBRIGATORIA: 'Registre como foi o aceite (5 a 1000 caracteres).',
  COMMERCIAL_PROPOSTA_NAO_CONVERTIVEL: 'Só converte com proposta enviada ou em negociação.',
  COMMERCIAL_CLIENTE_DUPLICADO: 'Já existe cliente ativo com este contato ou com a mesma loja neste produto. Nada foi criado.',
  COMMERCIAL_USUARIO_NAO_ENCONTRADO: 'Nenhuma conta com este e-mail no Supabase Auth. Crie a conta antes (fora do hub).',
  COMMERCIAL_ULTIMO_GESTOR: 'A equipe precisa de pelo menos um gestor ativo.',
  COMMERCIAL_ETAPA_SISTEMA: 'Etapa do sistema: só o nome pode mudar.',
  COMMERCIAL_ORDEM_INVALIDA: 'Etapas de trabalho ficam entre 11 e 89 (entre Novo e Convertido).',
  COMMERCIAL_ETAPA_EM_USO: 'Há leads nesta etapa. Mova-os antes de desativar.',
}
export const mensagemCrm = (code: string | undefined, fallback = 'Não foi possível salvar.') => (code && MENSAGENS[code]) || fallback

// ── Contato: links abertos pela pessoa (sem envio automático) ───────────────
export function whatsappLink(l: Pick<Lead, 'channel' | 'contact' | 'phone'>): string | null {
  const raw = l.phone || (l.channel === 'whatsapp' ? l.contact : '')
  let d = (raw ?? '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return d.length >= 12 && d.length <= 15 ? `https://wa.me/${d}` : null
}
export function emailLink(l: Pick<Lead, 'channel' | 'contact' | 'email'>): string | null {
  const e = l.email || (l.channel === 'email' ? l.contact : '')
  return e && EMAIL.test(e) ? `mailto:${e}` : null
}

// ── Indicadores (todos derivados dos registros reais recebidos) ─────────────
export type DashLead = Pick<Lead, 'id' | 'status' | 'product' | 'origem' | 'created_at'> &
  Partial<Pick<Lead, 'utm_campaign' | 'owner_id' | 'primeiro_atendimento_em' | 'motivo_perda' | 'ultimo_contato_em' | 'store' | 'name' | 'etapa_desde'>>
export type DashActivity = Pick<Activity, 'lead_id' | 'tipo' | 'agendada_para' | 'concluida_em' | 'cancelada_em'>
export type DashProposal = Pick<Proposal, 'lead_id' | 'status' | 'valor_mensal_centavos' | 'enviada_em' | 'versao'>

export interface Breakdown { chave: string; rotulo: string; total: number; convertidos: number; perdidos: number; abertos: number; taxa: number | null }

export interface Dashboard {
  total: number
  novos: number
  qualificacao: number
  abertas: number
  demosAgendadas: number
  propostasEnviadas: number
  convertidos: number
  perdidos: number
  taxaConversao: number | null
  tempoPrimeiroAtendimentoH: number | null
  semAtendimento: number
  receitaPotencialCentavos: number
  porEtapa: Array<{ codigo: string; rotulo: string; tipo: Stage['tipo']; n: number }>
  porOrigem: Breakdown[]
  porCampanha: Breakdown[]
  porResponsavel: Breakdown[]
  motivosPerda: Array<{ motivo: string; n: number }>
}

function breakdown(leads: readonly DashLead[], stages: readonly Stage[], key: (l: DashLead) => string, label: (k: string) => string): Breakdown[] {
  const m = new Map<string, Breakdown>()
  for (const l of leads) {
    const k = key(l)
    const b = m.get(k) ?? { chave: k, rotulo: label(k), total: 0, convertidos: 0, perdidos: 0, abertos: 0, taxa: null }
    const t = stageTipo(stages, l.status)
    b.total++
    if (t === 'ganha') b.convertidos++
    else if (t === 'perdida') b.perdidos++
    else b.abertos++
    m.set(k, b)
  }
  return [...m.values()]
    .map((b) => ({ ...b, taxa: b.convertidos + b.perdidos ? Math.round((b.convertidos / (b.convertidos + b.perdidos)) * 100) : null }))
    .sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo))
}

/**
 * Coorte: os leads que ENTRARAM no período/filtro. Todos os números se referem a essa coorte,
 * para cada indicador ser rastreável à lista de leads com o mesmo filtro.
 */
export function computeDashboard(leads: readonly DashLead[], activities: readonly DashActivity[], proposals: readonly DashProposal[], stages: readonly Stage[], members: readonly Member[], now: Date = new Date()): Dashboard {
  const ids = new Set(leads.map((l) => l.id))
  const tipo = (s: string) => stageTipo(stages, s)
  const count = (f: (l: DashLead) => boolean) => leads.filter(f).length
  const convertidos = count((l) => tipo(l.status) === 'ganha')
  const perdidos = count((l) => tipo(l.status) === 'perdida')
  const atendidos = leads.filter((l) => l.primeiro_atendimento_em)
  const horas = atendidos.map((l) => (new Date(l.primeiro_atendimento_em as string).getTime() - new Date(l.created_at).getTime()) / 3_600_000).filter((h) => h >= 0)
  const abertosIds = new Set(leads.filter((l) => tipo(l.status) === 'aberta').map((l) => l.id))
  // receita potencial: valor mensal da proposta aberta mais recente de cada lead em aberto
  const ultima = new Map<string, DashProposal>()
  for (const p of proposals) {
    if (!abertosIds.has(p.lead_id) || !PROPOSAL_ABERTA(p.status)) continue
    const cur = ultima.get(p.lead_id)
    if (!cur || p.versao > cur.versao) ultima.set(p.lead_id, p)
  }
  const motivos = new Map<string, number>()
  for (const l of leads) if (tipo(l.status) === 'perdida') { const k = (l.motivo_perda ?? 'Sem motivo registrado').trim(); motivos.set(k, (motivos.get(k) ?? 0) + 1) }
  return {
    total: leads.length,
    novos: count((l) => l.status === 'novo'),
    qualificacao: count((l) => l.status === 'qualificacao'),
    abertas: count((l) => tipo(l.status) === 'aberta' && l.status !== 'novo'),
    demosAgendadas: activities.filter((a) => ids.has(a.lead_id) && a.tipo === 'demonstracao' && !a.concluida_em && !a.cancelada_em && new Date(a.agendada_para) >= new Date(now.getTime() - 86_400_000)).length,
    propostasEnviadas: proposals.filter((p) => ids.has(p.lead_id) && p.enviada_em).length,
    convertidos,
    perdidos,
    taxaConversao: convertidos + perdidos ? Math.round((convertidos / (convertidos + perdidos)) * 100) : null,
    tempoPrimeiroAtendimentoH: horas.length ? Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10 : null,
    semAtendimento: count((l) => !l.primeiro_atendimento_em && tipo(l.status) === 'aberta'),
    receitaPotencialCentavos: [...ultima.values()].reduce((s, p) => s + p.valor_mensal_centavos, 0),
    porEtapa: sortedStages(stages).filter((s) => s.ativo || leads.some((l) => l.status === s.codigo)).map((s) => ({ codigo: s.codigo, rotulo: s.rotulo, tipo: s.tipo, n: count((l) => l.status === s.codigo) })),
    porOrigem: breakdown(leads, stages, (l) => l.origem, (k) => ORIGEM_LABEL[k as Origem] ?? k),
    porCampanha: breakdown(leads, stages, (l) => l.utm_campaign?.trim() || '', (k) => k || 'Sem campanha (UTM)'),
    porResponsavel: breakdown(leads, stages, (l) => l.owner_id ?? '', (k) => memberName(members, k || null)),
    motivosPerda: [...motivos.entries()].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n).slice(0, 8),
  }
}

/** Alerta: lead em aberto sem atividade pendente e sem contato há N dias (ou nunca atendido). */
export function semAcompanhamento<T extends DashLead>(leads: readonly T[], pendentes: readonly Pick<Activity, 'lead_id'>[], stages: readonly Stage[], now: Date = new Date(), dias = 3): Array<T & { diasParado: number }> {
  const comAgenda = new Set(pendentes.map((a) => a.lead_id))
  const limite = now.getTime() - dias * 86_400_000
  return leads
    .filter((l) => stageTipo(stages, l.status) === 'aberta' && !comAgenda.has(l.id))
    .map((l) => ({ ...l, ref: new Date(l.ultimo_contato_em ?? l.created_at).getTime() }))
    .filter((l) => l.ref < limite)
    .map(({ ref, ...l }) => ({ ...(l as unknown as T), diasParado: Math.floor((now.getTime() - ref) / 86_400_000) }))
    .sort((a, b) => b.diasParado - a.diasParado)
}

export interface Agenda { atrasadas: ActivityWithLead[]; hoje: ActivityWithLead[]; proximas: ActivityWithLead[] }

/** Separa atividades pendentes em atrasadas, hoje (fuso de São Paulo) e próximos 7 dias. */
export function agruparAgenda(pendentes: readonly ActivityWithLead[], now: Date = new Date()): Agenda {
  const dia = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
  const hoje = dia(now)
  const fim = now.getTime() + 7 * 86_400_000
  const ord = [...pendentes].sort((a, b) => a.agendada_para.localeCompare(b.agendada_para))
  return {
    atrasadas: ord.filter((a) => new Date(a.agendada_para) < now && dia(new Date(a.agendada_para)) < hoje),
    hoje: ord.filter((a) => dia(new Date(a.agendada_para)) === hoje),
    proximas: ord.filter((a) => dia(new Date(a.agendada_para)) > hoje && new Date(a.agendada_para).getTime() <= fim),
  }
}

/** Possíveis duplicados de um lead (mesmo contato numérico, e-mail ou loja). */
export function possiveisDuplicados<T extends Pick<Lead, 'id' | 'contact' | 'store'> & { email?: string | null }>(lead: T, outros: readonly T[]): T[] {
  const dig = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')
  const d = dig(lead.contact)
  const e = lead.email?.toLowerCase()
  const s = lead.store.trim().toLowerCase()
  return outros.filter((o) => o.id !== lead.id && (
    (d.length >= 8 && dig(o.contact) === d) || (!!e && o.email?.toLowerCase() === e) || o.store.trim().toLowerCase() === s))
}

export const formatHoras = (h: number | null) => (h === null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toLocaleString('pt-BR')} h` : `${Math.round(h / 24)} dias`)
