'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { mensagemCrm, parseMember, parseStage } from '@/lib/crm'
import { RepoError } from '@/lib/repo'
import { requireGestor } from '@/lib/session'

const back = (msg: string, erro = false): never => redirect(`/equipe?${erro ? 'erro' : 'msg'}=${encodeURIComponent(msg)}`)
const falha = (e: unknown) => (e instanceof RepoError ? mensagemCrm(e.code, e.message) : 'Não foi possível salvar.')

export async function saveMember(form: FormData) {
  const { repo } = await requireGestor()
  const p = parseMember(form)
  if (!p.ok) return back(p.error, true)
  try { await repo.saveMember(p.value) } catch (e) { back(falha(e), true) }
  revalidatePath('/equipe')
  back('Equipe atualizada.')
}

export async function saveStage(form: FormData) {
  const { repo } = await requireGestor()
  const p = parseStage(form)
  if (!p.ok) return back(p.error, true)
  try { await repo.saveStage(p.value) } catch (e) { back(falha(e), true) }
  revalidatePath('/equipe')
  revalidatePath('/pipeline')
  back('Etapas atualizadas.')
}
