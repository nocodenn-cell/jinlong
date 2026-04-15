import { createClient } from '@/lib/supabase/server'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'

export type GerenteAuth = { ok: true } | { ok: false; error: string }

/**
 * Garante sessão autenticada e perfil GERENTE, DONO ou ADMIN (alinha às policies RLS).
 */
export async function assertGerenteOuDono(): Promise<GerenteAuth> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Faça login para continuar.' }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('perfil')
    .eq('id', user.id)
    .single()

  if (!usuario || !isPerfilPainelGerencial(usuario.perfil)) {
    return {
      ok: false,
      error: 'Esta área é só para gerente, dono ou administrador. Use uma conta com permissão.',
    }
  }
  return { ok: true }
}
