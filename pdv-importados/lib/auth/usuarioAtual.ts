import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { clearStaleSessionIfNeeded } from '@/lib/auth/staleSession'
import { normalizeIdioma, type Idioma } from '@/idioma/normalizeIdioma'
import { normalizePerfilUsuario, type PerfilUsuario } from '@/idioma/normalizePerfilUsuario'

export type UsuarioAtual = {
  /** `null` quando não há sessão autenticada. */
  userId: string | null
  perfil: PerfilUsuario
  idioma: Idioma
  /** Loja do usuário; `null` se não houver sessão ou loja associada. */
  lojaId: string | null
}

/**
 * Resolve usuário, perfil e idioma uma única vez por requisição.
 *
 * `cache()` do React memoiza o resultado dentro do escopo da requisição (RSC render
 * + Server Actions invocadas durante o render). Assim, layout, page e todas as actions
 * compartilham UMA chamada a `auth.getUser()` (round-trip de rede ao Auth do Supabase)
 * e UM SELECT de perfil, em vez de repeti-los a cada chamada.
 */
export const getUsuarioAtual = cache(async (): Promise<UsuarioAtual> => {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    if (await clearStaleSessionIfNeeded(supabase, authError)) {
      redirect('/login?reason=sessao_expirada')
    }
    throw authError
  }

  if (!user) {
    return { userId: null, perfil: 'OPERADOR', idioma: 'pt', lojaId: null }
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('perfil, idioma_preferido, loja_id')
    .eq('id', user.id)
    .single()

  return {
    userId: user.id,
    perfil: normalizePerfilUsuario(usuario?.perfil),
    idioma: normalizeIdioma(usuario?.idioma_preferido),
    lojaId: (usuario?.loja_id as string | null | undefined) ?? null,
  }
})
