import type { User } from '@supabase/supabase-js'
import type { Idioma } from '@/idioma/normalizeIdioma'
import type { PerfilUsuario } from '@/idioma/normalizePerfilUsuario'

/** Papel canônico consumido por adminPolicy — independente de runtime. */
export type AdminRole = 'admin' | 'gerente' | 'owner'

/** Origem da leitura de sessão (apenas metadado; não altera decisão). */
export type SessionSource = 'edge' | 'ssr'

/**
 * Contrato único de sessão para adminPolicy.
 * Edge e SSR devem produzir o mesmo contrato para o mesmo RawSession.
 */
export type AdminSessionContract = {
  userId: string
  role: AdminRole
  permissions: string[]
  source: SessionSource
}

/** Estado de autenticação normalizado — substitui leitura direta de raw.status. */
export type SessionAuthState =
  | 'anonymous'
  | 'stale'
  | 'auth_error'
  | 'db_error'
  | 'authenticated'
  | 'blocked'

/** Motivo de bloqueio de usuário autenticado (authState === 'blocked'). */
export type SessionBlockedReason =
  | 'inativo'
  | 'sem_loja'
  | 'empresa_ativa_obrigatoria'
  | 'empresa_nao_autorizada'
  | 'loja_nao_autorizada'
  | 'empresa_divergente'

/**
 * Resultado completo da normalização: contrato policy + sessão legada + metadados.
 */
export type SessionNormalization = {
  contract: AdminSessionContract | null
  session: AdminSession | null
  authState: SessionAuthState
  perfil: PerfilUsuario | null
  source: SessionSource
  /** Presente apenas quando authState === 'blocked'. */
  blockedReason?: SessionBlockedReason
}

/** Sessão admin enriquecida (compatibilidade com contexto/UI existente). */
export type AdminSession = {
  userId: string
  user: User
  perfil: PerfilUsuario
  idioma: Idioma
  lojaId: string | null
  /** M2-B: empresa ativa resolvida no servidor (null em modo legado sem vínculos). */
  empresaId?: string | null
}
