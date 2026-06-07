import type { User } from '@supabase/supabase-js'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { PerfilUsuario } from '@/idioma/normalizePerfilUsuario'

export type AdminSession = {
  userId: string
  user: User
  perfil: PerfilUsuario
  idioma: Idioma
  lojaId: string | null
}
