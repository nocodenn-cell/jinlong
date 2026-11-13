'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { formatBRL, mensagemConversao, parseConversao, parseFollowup } from '@/lib/conversao'
import { isUuid, parseNote, parseStatusChange } from '@/lib/model'
import { RepoError } from '@/lib/repo'
import { requireAdmin } from '@/lib/session'

const back = (empresaId: string, msg: string, erro = false): never =>
  redirect(`/conversao/${empresaId}?${erro ? 'erro' : 'msg'}=${encodeURIComponent(msg)}`)
const empresaDo = (form: FormData) => {
  const id = form.get('empresaId')
  return isUuid(id) ? id : redirect('/conversao')
}
const falha = (e: unknown) => (e instanceof RepoError ? e.message : 'Não foi possível salvar.')

/** Cria a ficha comercial de um teste cujo lead não foi gerado no cadastro (idempotente). */
export async function criarFicha(form: FormData) {
  const empresaId = empresaDo(form)
  const { repo } = await requireAdmin()
  try { await repo.ensureTrialLead(empresaId) } catch (e) { back(empresaId, falha(e), true) }
  back(empresaId, 'Ficha comercial criada.')
}

export async function salvarAcompanhamento(form: FormData) {
  const empresaId = empresaDo(form)
  const { repo } = await requireAdmin()
  const p = parseFollowup(form)
  if (!p.ok) return back(empresaId, p.error, true)
  try { await repo.updateFollowup(p.value.leadId, { interesse: p.value.interesse, proximo_contato: p.value.proximo_contato }) } catch (e) { back(empresaId, falha(e), true) }
  revalidatePath('/conversao')
  back(empresaId, 'Acompanhamento salvo.')
}

export async function registrarContato(form: FormData) {
  const empresaId = empresaDo(form)
  const { repo } = await requireAdmin()
  const p = parseNote(form)
  if (!p.ok) return back(empresaId, p.error, true)
  try { await repo.addEvent(p.value.leadId, p.value.kind, p.value.body) } catch (e) { back(empresaId, falha(e), true) }
  revalidatePath('/conversao')
  back(empresaId, 'Registro adicionado ao histórico.')
}

export async function mudarEtapa(form: FormData) {
  const empresaId = empresaDo(form)
  const { repo } = await requireAdmin()
  const p = parseStatusChange(form)
  if (!p.ok) return back(empresaId, p.error, true)
  try { await repo.changeStatus(p.value.leadId, p.value.status) } catch (e) { back(empresaId, falha(e), true) }
  revalidatePath('/conversao')
  back(empresaId, 'Etapa do funil atualizada.')
}

/** Conversão MANUAL aprovada pelo dono da Nature Code. Não cria cobrança nem assinatura no Asaas. */
export async function converter(form: FormData) {
  const empresaId = empresaDo(form)
  const { repo } = await requireAdmin()
  const planos = await repo.listPlanos().catch(() => null)
  if (!planos) return back(empresaId, 'Não foi possível carregar os planos agora. Tente de novo.', true)
  const p = parseConversao(form, planos)
  if (!p.ok) return back(empresaId, p.error, true)
  let valor = 0
  try {
    valor = (await repo.convertTrial(p.value)).valor_mensal_centavos
  } catch (e) {
    back(empresaId, mensagemConversao(e instanceof RepoError ? e.code : undefined), true)
  }
  revalidatePath('/conversao')
  revalidatePath('/clientes')
  revalidatePath('/')
  back(empresaId, `Convertido em cliente pagante: ${formatBRL(valor)}/mês. Nenhuma cobrança automática foi criada.`)
}
