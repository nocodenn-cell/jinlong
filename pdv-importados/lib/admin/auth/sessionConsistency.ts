import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
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
  /**
   * Vínculos ativos (multiempresa, ESPEC_MULTIEMPRESA_V1 §9). `undefined` = não lidos
   * (tabela ainda não existe no ambiente) ⇒ compatibilidade, sem bloqueio novo.
   */
  vinculos?: RawVinculo[]
}

export type RawVinculo = {
  empresa_id: string
  loja_id: string | null
  papel: 'DONO' | 'GERENTE' | 'OPERADOR'
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
    empresaId: raw.usuario?.vinculos?.[0]?.empresa_id ?? null,
    vinculos: raw.usuario?.vinculos ?? null,
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
 * `sub` do access token guardado nos cookies, lido SEM verificar a assinatura.
 *
 * Serve apenas como dica para iniciar a leitura do perfil em paralelo com
 * `auth.getUser()`. Nunca é base de decisão: o resultado antecipado só é usado
 * quando `getUser()` (verificação no servidor de Auth) confirma o MESMO id, e a
 * própria leitura roda com esse JWT — validado pelo PostgREST e sujeito a RLS.
 * Qualquer falha devolve `null` e o fluxo segue sequencial, como antes.
 */
async function lerDicaUserIdNaoVerificada(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (typeof token !== 'string') return null
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const sub = (JSON.parse(atob(padded)) as { sub?: unknown }).sub
    return typeof sub === 'string' && sub.length > 0 ? sub : null
  } catch {
    return null
  }
}

function lerPerfilUsuario(supabase: SupabaseClient, userId: string) {
  return supabase.from('usuarios').select(USUARIO_SELECT).eq('id', userId).single()
}

/**
 * Vínculos ativos do usuário. Qualquer falha (tabela inexistente antes da migration,
 * client de teste sem a tabela) devolve `undefined` = modo compatibilidade.
 */
async function lerVinculos(supabase: SupabaseClient, userId: string): Promise<RawVinculo[] | undefined> {
  try {
    const q = supabase.from('usuario_vinculos') as unknown as {
      select?: (c: string) => { eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => PromiseLike<{ data: unknown; error: unknown }> } }
    }
    if (typeof q?.select !== 'function') return undefined
    const { data, error } = await q.select('empresa_id, loja_id, papel').eq('usuario_id', userId).eq('ativo', true)
    if (error || !Array.isArray(data)) return undefined
    return data as RawVinculo[]
  } catch {
    return undefined
  }
}

/**
 * Única leitura Supabase de auth + perfil (cookies já vinculados ao client).
 * Retorna apenas dados brutos — sem interpretação de role/permissão.
 *
 * Perf (docs/audits/AUDITORIA_AUTH_PERFORMANCE.md): o perfil é lido em paralelo
 * com `getUser()` em vez de depois dele, tirando uma ida sequencial ao Supabase de
 * cada request (middleware e RSC). A regra de acesso não muda — sem `getUser()`
 * válido não há sessão, e perfil lido para outro id é descartado e relido.
 */
export async function fetchRawSession(supabase: SupabaseClient): Promise<RawSession> {
  const dicaUserId = await lerDicaUserIdNaoVerificada(supabase)
  const perfilAntecipado = dicaUserId
    ? Promise.resolve(lerPerfilUsuario(supabase, dicaUserId)).then(
        (res) => res,
        () => null,
      )
    : null

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

  const vinculosPromise = lerVinculos(supabase, user.id)
  const antecipado = perfilAntecipado && dicaUserId === user.id ? await perfilAntecipado : null
  const { data: usuario, error: dbError } =
    antecipado && !antecipado.error ? antecipado : await lerPerfilUsuario(supabase, user.id)

  if (dbError) {
    return { status: 'db_error', user, error: dbError }
  }

  const vinculos = await vinculosPromise
  if (!usuario || vinculos === undefined) return { status: 'authenticated', user, usuario }
  return { status: 'authenticated', user, usuario: { ...(usuario as RawUsuarioRow), vinculos } }
}

/** Bloqueio de identidade: conta desativada ou sem loja vinculada não entra em rota protegida. */
function resolveBlockedReason(raw: RawSession): SessionBlockedReason | null {
  if (raw.status !== 'authenticated') return null
  if (raw.usuario?.ativo === false) return 'inativo'
  if (!raw.usuario?.loja_id) return 'sem_loja'
  const vinculos = raw.usuario.vinculos
  // Multiempresa: só decide quando os vínculos foram lidos. ADMIN legado não tem vínculo (D9).
  if (vinculos !== undefined && normalizePerfilUsuario(raw.usuario.perfil ?? null) !== 'ADMIN') {
    const empresas = new Set(vinculos.map((v) => v.empresa_id))
    if (empresas.size === 0) return 'sem_empresa'
    if (empresas.size > 1) return 'multi_empresa' // sem seletor de empresa ⇒ falha fechada (§4/§9)
  }
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
