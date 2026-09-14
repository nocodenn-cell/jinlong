import 'server-only'
import { getRawSession } from '@/lib/admin/auth/sessionConsistency'
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

const ANONIMO: UsuarioAtual = { userId: null, perfil: 'OPERADOR', idioma: 'pt', lojaId: null }

/**
 * Resolve usuário, perfil e idioma uma única vez por requisição.
 *
 * Deriva de `getRawSession()` (`cache()` do React por request). Assim o layout
 * admin, a página, `getUsuarioAtual` e as Server Actions do mesmo request
 * compartilham UMA chamada a `auth.getUser()` e UMA leitura de `usuarios` — antes
 * eram dois caches independentes lendo o mesmo perfil com colunas diferentes.
 * Semântica preservada: sessão stale ou ausente → anônimo; erro de auth ou de
 * leitura do perfil → exceção.
 */
export async function getUsuarioAtual(): Promise<UsuarioAtual> {
  const raw = await getRawSession()

  switch (raw.status) {
    case 'authenticated':
      return {
        userId: raw.user.id,
        perfil: normalizePerfilUsuario(raw.usuario?.perfil),
        idioma: normalizeIdioma(raw.usuario?.idioma_preferido),
        lojaId: (raw.usuario?.loja_id as string | null | undefined) ?? null,
      }
    case 'auth_error':
      throw raw.error
    case 'db_error':
      console.error('Erro ao buscar usuário:', raw.error)
      throw raw.error
    default:
      return { ...ANONIMO }
  }
}
