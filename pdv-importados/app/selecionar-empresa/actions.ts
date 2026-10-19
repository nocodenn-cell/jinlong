'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ROUTES } from '@/lib/navigation/routes'
import { COOKIE_EMPRESA, destinoSeguro, normalizarEmpresaId } from '@/lib/multiempresa/empresaSelecionada'
import { listarEmpresasDoUsuario, lojaAtivaParaEmpresa } from '@/lib/multiempresa/selecionarEmpresa'

export async function selecionarEmpresaAction(formData: FormData): Promise<void> {
  const empresaId = normalizarEmpresaId(formData.get('empresa_id'))
  const next = destinoSeguro(formData.get('next'))
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`${ROUTES.auth.login}?next=${encodeURIComponent(next)}`)
  if (!empresaId) redirect(`${ROUTES.auth.selecionarEmpresa}?erro=invalida&next=${encodeURIComponent(next)}`)

  const vinculos = await listarEmpresasDoUsuario(supabase, user.id)
  const admin = createAdminClient()
  const r = await lojaAtivaParaEmpresa(admin, vinculos, empresaId)
  if (!r.ok) redirect(`${ROUTES.auth.selecionarEmpresa}?erro=${r.motivo}&next=${encodeURIComponent(next)}`)

  const { error } = await admin.from('usuarios').update({ loja_id: r.lojaId }).eq('id', user.id)
  if (error) redirect(`${ROUTES.auth.selecionarEmpresa}?erro=gravar&next=${encodeURIComponent(next)}`)

  ;(await cookies()).set(COOKIE_EMPRESA, empresaId, {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false, // o client.ts do browser precisa ler para mandar x-fp-empresa
    maxAge: 60 * 60 * 24 * 30,
  })
  redirect(next)
}
