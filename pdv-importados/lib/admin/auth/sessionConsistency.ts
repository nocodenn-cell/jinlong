import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isContaAtiva } from '@/core/auth/contaAtiva'
import { clearStaleSessionIfNeeded } from '@/lib/auth/staleSession'
import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import { normalizeIdioma } from '@/idioma/normalizeIdioma'
import { normalizePerfilUsuario, type PerfilUsuario } from '@/idioma/normalizePerfilUsuario'
import { derivePermissionsForSession } from '@/lib/admin/policy/adminPolicy'
import type {
  AdminRole,
  AdminSession,
  AdminSessionContract,
  SessionAuthState,
  SessionBlockedReason,
  SessionNormalization,
  SessionSource,
} from './types'

export type RawUsuarioRow = {
  perfil: string | null | undefined
  idioma_preferido: string | null | undefined
  loja_id: string | null | undefined
  /** `false` bloqueia o acesso; `null`/ausente é tratado como ativo (compat com linhas antigas). */
  ativo?: boolean | null
}

export type RawSession =
  | { status: 'anonymous' }
  | { status: 'stale' }
  | { status: 'authenticated'; user: User; usuario: RawUsuarioRow | null }
  | { status: 'auth_error'; error: Error }
  | { status: 'db_error'; user: User; error: Error }

const USUARIO_SELECT = 'perfil, idioma_preferido, loja_id, ativo'

function rawToAuthState(raw: RawSession): SessionAuthState {
  switch (raw.status) {
    case 'anonymous':
      return 'anonymous'
    case 'stale':
      return 'stale'
    case 'auth_error':
      return 'auth_error'
    case 'db_error':
      return 'db_error'
    case 'authenticated':
      return 'authenticated'
    default: {
      const _exhaustive: never = raw
      return _exhaustive
    }
  }
}

function perfilToRole(perfil: PerfilUsuario): AdminRole | null {
  switch (perfil) {
    case 'ADMIN':
      return 'admin'
    case 'GERENTE':
      return 'gerente'
    case 'DONO':
      return 'owner'
    default:
      return null
  }
}

function buildAdminSession(raw: Extract<RawSession, { status: 'authenticated' }>): AdminSession | null {
  const perfil = normalizePerfilUsuario(raw.usuario?.perfil ?? null)
  if (!isPerfilPainelGerencial(perfil)) return null
  return {
    userId: raw.user.id,
    user: raw.user,
    perfil,
    idioma: normalizeIdioma(raw.usuario?.idioma_preferido),
    lojaId: (raw.usuario?.loja_id as string | null | undefined) ?? null,
  }
}

function buildContract(session: AdminSession, source: SessionSource): AdminSessionContract {
  const role = perfilToRole(session.perfil)
  if (!role) {
    throw new Error('buildContract: perfil não gerencial')
  }
  return {
    userId: session.userId,
    role,
    permissions: derivePermissionsForSession(session),
    source,
  }
}

/**
 * Única leitura Supabase de auth + perfil (cookies já vinculados ao client).
 * Retorna apenas dados brutos — sem interpretação de role/permissão.
 */
export async function fetchRawSession(supabase: SupabaseClient): Promise<RawSession> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError) {
    if (await clearStaleSessionIfNeeded(supabase, authError)) {
      return { status: 'stale' }
    }
    return { status: 'auth_error', error: authError }
  }

  if (!user) return { status: 'anonymous' }

  const { data: usuario, error: dbError } = await supabase
    .from('usuarios')
    .select(USUARIO_SELECT)
    .eq('id', user.id)
    .single()

  if (dbError) {
    return { status: 'db_error', user, error: dbError }
  }

  return { status: 'authenticated', user, usuario }
}

/** Bloqueio de identidade: conta desativada ou sem loja vinculada não entra em rota protegida. */
function resolveBlockedReason(raw: RawSession): SessionBlockedReason | null {
  if (raw.status !== 'authenticated') return null
  if (!isContaAtiva(raw.usuario?.ativo)) return 'inativo'
  if (!raw.usuario?.loja_id) return 'sem_loja'
  return null
}

/**
 * Única função de normalização edge/SSR → contrato policy + sessão.
 * Idempotente: mesmo RawSession + source produz resultado determinístico.
 */
export function normalizeAdminSession(raw: RawSession, source: SessionSource): SessionNormalization {
  let authState = rawToAuthState(raw)
  let perfil: PerfilUsuario | null = null
  let session: AdminSession | null = null

  const blockedReason = resolveBlockedReason(raw)

  if (raw.status === 'authenticated') {
    perfil = normalizePerfilUsuario(raw.usuario?.perfil ?? null)
    if (blockedReason) {
      authState = 'blocked'
    } else {
      session = buildAdminSession(raw)
    }
  }

  const contract = session ? buildContract(session, source) : null

  return blockedReason
    ? { contract, session, authState, perfil, source, blockedReason }
    : { contract, session, authState, perfil, source }
}

/**
 * @deprecated Use normalizeAdminSession(raw, source).session
 * Mantido para compatibilidade — delega ao normalizador único.
 */
export function normalizeSession(raw: RawSession): AdminSession | null {
  return normalizeAdminSession(raw, 'ssr').session
}

/**
 * @deprecated Use normalizeAdminSession(raw, source).perfil
 */
export function resolvePerfilFromRaw(raw: RawSession): PerfilUsuario {
  return normalizeAdminSession(raw, 'ssr').perfil ?? 'OPERADOR'
}

async function readRawSessionSsr(): Promise<RawSession> {
  const { createClient } = await import('@/lib/supabase/server')
  return fetchRawSession(await createClient())
}

type CachedFn<T> = () => Promise<T>

let cachedGetRawSession: CachedFn<RawSession> | null = null
let cachedGetAdminNormalization: CachedFn<SessionNormalization> | null = null
let cacheInit: Promise<void> | null = null

async function ensureSsrCaches(): Promise<void> {
  if (cachedGetRawSession && cachedGetAdminNormalization) return
  if (!cacheInit) {
    cacheInit = (async () => {
      const { cache } = await import('react')
      cachedGetRawSession = cache(readRawSessionSsr)
      cachedGetAdminNormalization = cache(async (): Promise<SessionNormalization> => {
        const raw = await cachedGetRawSession!()
        return normalizeAdminSession(raw, 'ssr')
      })
    })()
  }
  await cacheInit
}

/**
 * Único ponto SSR/action que lê cookies via createClient + Supabase.
 * Memoizado por request (React cache).
 */
export async function getRawSession(): Promise<RawSession> {
  await ensureSsrCaches()
  return cachedGetRawSession!()
}

/**
 * Normalização cacheada por request — fonte única SSR antes de adminPolicy.
 */
export async function getCachedAdminNormalization(): Promise<SessionNormalization> {
  await ensureSsrCaches()
  return cachedGetAdminNormalization!()
}

/**
 * Sessão admin cacheada por request: normalizeAdminSession(getRawSession(), 'ssr').session
 */
export async function getCachedAdminSession(): Promise<AdminSession | null> {
  const normalized = await getCachedAdminNormalization()
  return normalized.session
}
