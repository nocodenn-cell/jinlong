'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { parseNote, parseStatusChange } from '@/lib/model'
import { RepoError } from '@/lib/repo'
import { requireAdmin } from '@/lib/session'

const back = (id: string, msg?: string) => redirect(`/leads/${id}${msg ? `?msg=${encodeURIComponent(msg)}` : ''}`)

export async function changeStatus(form: FormData) {
  const { repo } = await requireAdmin()
  const p = parseStatusChange(form)
  if (!p.ok) redirect('/leads')
  try {
    await repo.changeStatus(p.value.leadId, p.value.status)
  } catch (e) {
    back(p.value.leadId, e instanceof RepoError ? e.message : 'Não foi possível salvar.')
  }
  revalidatePath('/')
  back(p.value.leadId, 'Status atualizado.')
}

export async function addEvent(form: FormData) {
  const { repo } = await requireAdmin()
  const p = parseNote(form)
  const leadId = String(form.get('leadId') ?? '')
  if (!p.ok) return back(leadId, p.error)
  try {
    await repo.addEvent(p.value.leadId, p.value.kind, p.value.body)
  } catch (e) {
    back(p.value.leadId, e instanceof RepoError ? e.message : 'Não foi possível salvar.')
  }
  back(p.value.leadId, 'Registro adicionado.')
}
