'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { isUuid, parseNote, parseStatusChange } from '@/lib/model'
import { mensagemCrm, parseActivity, parseAssign, parseConclude, parseConvert, parseLeadUpdate, parseNewLead, parseProposal, parseProposalStatus } from '@/lib/crm'
import { RepoError } from '@/lib/repo'
import { requireGestor, requireMember } from '@/lib/session'

/** Volta para a origem do formulário (detalhe do lead, pipeline ou agenda), com mensagem. */
function back(form: FormData, leadId: string, msg: string, erro = false): never {
  const voltar = String(form.get('voltar') ?? '')
  const base = voltar === 'pipeline' ? '/pipeline' : voltar === 'agenda' ? '/agenda' : `/leads/${isUuid(leadId) ? leadId : ''}`
  redirect(`${base}?${erro ? 'erro' : 'msg'}=${encodeURIComponent(msg)}`)
}
const falha = (e: unknown) => (e instanceof RepoError ? mensagemCrm(e.code, e.message) : 'Não foi possível salvar.')
const leadDo = (form: FormData) => String(form.get('leadId') ?? '')

function refresh(leadId?: string) {
  revalidatePath('/')
  revalidatePath('/pipeline')
  revalidatePath('/agenda')
  revalidatePath('/leads')
  if (leadId) revalidatePath(`/leads/${leadId}`)
}

export async function changeStatus(form: FormData) {
  const { repo } = await requireMember()
  const p = parseStatusChange(form)
  if (!p.ok) return back(form, leadDo(form), p.error, true)
  try { await repo.changeStatus(p.value.leadId, p.value.status, p.value.motivo) } catch (e) { back(form, p.value.leadId, falha(e), true) }
  refresh(p.value.leadId)
  back(form, p.value.leadId, 'Etapa atualizada.')
}

export async function addEvent(form: FormData) {
  const { repo } = await requireMember()
  const p = parseNote(form)
  if (!p.ok) return back(form, leadDo(form), p.error, true)
  try { await repo.addEvent(p.value.leadId, p.value.kind, p.value.body) } catch (e) { back(form, p.value.leadId, falha(e), true) }
  refresh(p.value.leadId)
  back(form, p.value.leadId, 'Registro adicionado ao histórico.')
}

export async function assignLead(form: FormData) {
  const { repo } = await requireMember()
  const p = parseAssign(form)
  if (!p.ok) return back(form, leadDo(form), p.error, true)
  try { await repo.assignLead(p.value.leadId, p.value.owner) } catch (e) { back(form, p.value.leadId, falha(e), true) }
  refresh(p.value.leadId)
  back(form, p.value.leadId, 'Responsável atualizado.')
}

export async function updateLead(form: FormData) {
  const { repo } = await requireMember()
  const p = parseLeadUpdate(form)
  if (!p.ok) return back(form, leadDo(form), p.error, true)
  try { await repo.updateLead(p.value.leadId, p.value.dados) } catch (e) { back(form, p.value.leadId, falha(e), true) }
  refresh(p.value.leadId)
  back(form, p.value.leadId, 'Dados salvos.')
}

export async function createLead(form: FormData) {
  const { repo } = await requireMember()
  const p = parseNewLead(form)
  if (!p.ok) redirect(`/leads/novo?erro=${encodeURIComponent(p.error)}`)
  let id = ''
  try { id = await repo.createLead(p.value) } catch (e) { redirect(`/leads/novo?erro=${encodeURIComponent(falha(e))}`) }
  refresh()
  redirect(`/leads/${id}?msg=${encodeURIComponent('Lead cadastrado e atribuído a você.')}`)
}

export async function scheduleActivity(form: FormData) {
  const { repo } = await requireMember()
  const p = parseActivity(form)
  if (!p.ok) return back(form, leadDo(form), p.error, true)
  try { await repo.scheduleActivity(p.value) } catch (e) { back(form, p.value.leadId, falha(e), true) }
  refresh(p.value.leadId)
  back(form, p.value.leadId, 'Atividade agendada.')
}

export async function concludeActivity(form: FormData) {
  const { repo } = await requireMember()
  const p = parseConclude(form)
  if (!p.ok) return back(form, leadDo(form), p.error, true)
  try { await repo.concludeActivity(p.value.id, p.value.resultado, p.value.cancelar) } catch (e) { back(form, leadDo(form), falha(e), true) }
  refresh(leadDo(form))
  back(form, leadDo(form), p.value.cancelar ? 'Atividade cancelada.' : 'Atividade concluída e registrada no histórico.')
}

export async function createProposal(form: FormData) {
  const { repo } = await requireMember()
  const planos = await repo.listCatalogo().catch(() => null)
  if (!planos) return back(form, leadDo(form), 'Catálogo de planos indisponível agora. Tente de novo.', true)
  const p = parseProposal(form, planos.filter((x) => x.tipo === 'PLANO').map((x) => x.codigo), planos.filter((x) => x.tipo === 'ADDON').map((x) => x.codigo))
  if (!p.ok) return back(form, leadDo(form), p.error, true)
  try { await repo.createProposal(p.value) } catch (e) { back(form, p.value.leadId, falha(e), true) }
  refresh(p.value.leadId)
  back(form, p.value.leadId, 'Proposta criada como rascunho. Envie quando estiver pronta.')
}

export async function setProposalStatus(form: FormData) {
  const { repo } = await requireMember()
  const p = parseProposalStatus(form)
  if (!p.ok) return back(form, leadDo(form), p.error, true)
  try { await repo.setProposalStatus(p.value.id, p.value.status, p.value.motivo) } catch (e) { back(form, p.value.leadId, falha(e), true) }
  refresh(p.value.leadId)
  back(form, p.value.leadId, 'Proposta atualizada.')
}

/** Conversão manual (só gestor; o banco confere de novo). Não cria cobrança. */
export async function convertLead(form: FormData) {
  const { repo } = await requireGestor()
  const p = parseConvert(form)
  if (!p.ok) return back(form, leadDo(form), p.error, true)
  try { await repo.convertLead(p.value.leadId, p.value.propostaId, p.value.observacao) } catch (e) { back(form, p.value.leadId, falha(e), true) }
  refresh(p.value.leadId)
  revalidatePath('/clientes')
  back(form, p.value.leadId, 'Convertido em cliente. Nenhuma cobrança automática foi criada.')
}
