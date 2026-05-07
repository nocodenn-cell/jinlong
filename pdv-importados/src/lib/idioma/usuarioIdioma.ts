import { createClient } from '@/lib/supabase/server'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import { normalizeIdioma, type Idioma } from './normalizeIdioma'
import { normalizePerfilUsuario, type PerfilUsuario } from './normalizePerfilUsuario'

export type { PerfilUsuario } from './normalizePerfilUsuario'

export async function getUsuarioIdioma(): Promise<{
  idioma: Idioma
  perfil: PerfilUsuario
}> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { idioma: 'pt', perfil: 'OPERADOR' }
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('perfil, idioma_preferido')
    .eq('id', user.id)
    .single()

  const perfil = normalizePerfilUsuario(usuario?.perfil)
  return {
    idioma: normalizeIdioma(usuario?.idioma_preferido),
    perfil,
  }
}

/** Inclui ADMIN (mesmo acesso de painel que gerente/dono no app; RLS em migração 044). */
export function isGerenteOuDono(perfil: PerfilUsuario): boolean {
  return isPerfilPainelGerencial(perfil)
}

