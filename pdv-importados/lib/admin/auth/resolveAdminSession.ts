import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { clearStaleSessionIfNeeded } from '@/lib/auth/staleSession'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import { normalizeIdioma } from '@/idioma/normalizeIdioma'
import { normalizePerfilUsuario } from '@/idioma/normalizePerfilUsuario'
import type { AdminSession } from './types'

/**
 * Single source of truth para sessão do painel /admin.
 * Sem redirect — retorna null se anônimo ou sem perfil gerencial.
 */
export const resolveAdminSession = cache(async (): Promise<AdminSession | null> => {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    if (await clearStaleSessionIfNeeded(supabase, authError)) {
      return null
    }
    throw authError
  }

  if (!user) return null

  const { data: usuario, error: dbError } = await supabase
    .from('usuarios')
    .select('perfil, idioma_preferido, loja_id')
    .eq('id', user.id)
    .single()

  if (dbError) throw dbError

  const perfil = normalizePerfilUsuario(usuario?.perfil)
  if (!isPerfilPainelGerencial(perfil)) return null

  return {
    userId: user.id,
    user,
    perfil,
    idioma: normalizeIdioma(usuario?.idioma_preferido),
    lojaId: (usuario?.loja_id as string | null | undefined) ?? null,
  }
})
