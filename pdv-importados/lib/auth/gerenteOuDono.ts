import { createClient } from '@/lib/supabase/server'

export type GerenteAuth = { ok: true } | { ok: false; error: string }

/**
 * Garante sessão autenticada e perfil GERENTE ou DONO (alinha às policies RLS).
 */
export async function assertGerenteOuDono(): Promise<GerenteAuth> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Não autenticado' }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('perfil')
    .eq('id', user.id)
    .single()

  if (!usuario || !['GERENTE', 'DONO'].includes(usuario.perfil)) {
    return { ok: false, error: 'Sem permissão' }
  }
  return { ok: true }
}
