'use server'

import { redirect } from 'next/navigation'
import { parseCustomerUpdate } from '@/lib/model'
import { RepoError } from '@/lib/repo'
import { requireAdmin } from '@/lib/session'

export async function updateCustomer(form: FormData) {
  const { repo } = await requireAdmin()
  const p = parseCustomerUpdate(form)
  if (!p.ok) redirect(`/clientes?msg=${encodeURIComponent(p.error)}`)
  try {
    const { id, ...rest } = p.value
    await repo.updateCustomer(id, rest)
  } catch (e) {
    redirect(`/clientes?msg=${encodeURIComponent(e instanceof RepoError ? e.message : 'Não foi possível salvar.')}`)
  }
  redirect('/clientes?msg=Salvo.')
}
