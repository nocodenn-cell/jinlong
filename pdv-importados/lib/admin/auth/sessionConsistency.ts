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
import {
  resolverContextoEmpresaAtiva,
  type TenantVinculo,
} from '@/lib/admin/auth/tenantContext'

export type RawUsuarioRow = {
  perfil: string | null | undefined
  idioma_preferido: string | null | undefined
  loja_id: string | null | undefined
  /** `false` bloqueia o acesso; `null`/ausente é tratado como ativo (compat com linhas antigas). */
  ativo?: boolean | null
}

/** Snapshot opcional M2-B — ausente quando tabelas multiempresa não existem. */
export type RawTenantSnapshot = {
  available: boolean
  vinculos: TenantVinculo[]
  persistido: { empresaId: string; lojaId: string | null; version: number } | null
  lojas: Record<string, { empresaId: string }>
}

export type RawSession =
  | { status: 'anonymous' }
  | { status: 'stale' }
  | {
      status: 'authenticated'
      user: User
      usuario: RawUsuarioRow | null
      tenant?: RawTenantSnapshot | null
    }
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
  const resolved = resolveTenantForRaw(raw)
  const lojaId =
    resolved?.ok === true
      ? resolved.lojaId
      : ((raw.usuario?.loja_id as string | null | undefined) ?? null)
  return {
    userId: raw.user.id,
    user: raw.user,
    perfil,
    idioma: normalizeIdioma(raw.usuario?.idioma_preferido),
    lojaId,
    empresaId: resolved?.ok === true && resolved.empresaId ? resolved.empresaId : null,
  }
}

function resolveTenantForRaw(raw: Extract<RawSession, { status: 'authenticated' }>) {
  const tenant = raw.tenant
  if (!tenant?.available) return null
  return resolverContextoEmpresaAtiva({
    authUserId: raw.user.id,
    ativo: raw.usuario?.ativo !== false,
    vinculos: tenant.vinculos,
    persistido: tenant.persistido,
    lojas: tenant.lojas,
    legacyLojaId: raw.usuario?.loja_id ?? null,
  })
}

function mapTenantBlock(
  code: string,
): SessionBlockedReason | null {
  switch (code) {
    case 'USUARIO_INATIVO':
      return 'inativo'
    case 'SEM_VINCULO':
      return 'sem_loja'
    case 'EMPRESA_ATIVA_OBRIGATORIA':
      return 'empresa_ativa_obrigatoria'
    case 'EMPRESA_NAO_AUTORIZADA':
      return 'empresa_nao_autorizada'
    case 'LOJA_FORA_DA_EMPRESA':
    case 'LOJA_NAO_AUTORIZADA':
      return 'loja_nao_autorizada'
    case 'EMPRESA_DIVERGENTE':
    case 'CONTEXTO_OBSOLETO':
      return 'empresa_divergente'
    default:
      return null
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

  const antecipado = perfilAntecipado && dicaUserId === user.id ? await perfilAntecipado : null
  const { data: usuario, error: dbError } =
    antecipado && !antecipado.error ? antecipado : await lerPerfilUsuario(supabase, user.id)

  if (dbError) {
    return { status: 'db_error', user, error: dbError }
  }

  const tenant = await loadTenantSnapshot(supabase, user.id)
  return { status: 'authenticated', user, usuario, tenant }
}

/** Carrega vínculos/contexto se as tabelas M1/M2 existirem; senão available=false (legado). */
async function loadTenantSnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<RawTenantSnapshot> {
  const vinculosRes = await supabase
    .from('usuario_vinculos')
    .select('empresa_id, loja_id, papel, ativo')
    .eq('usuario_id', userId)
    .eq('ativo', true)

  if (vinculosRes.error) {
    return { available: false, vinculos: [], persistido: null, lojas: {} }
  }

  const vinculos: TenantVinculo[] = (vinculosRes.data ?? []).map((row) => ({
    empresaId: String(row.empresa_id),
    lojaId: row.loja_id == null ? null : String(row.loja_id),
    papel: row.papel as TenantVinculo['papel'],
    ativo: row.ativo !== false,
  }))

  const ctxRes = await supabase
    .from('usuario_contexto_ativo')
    .select('empresa_id, loja_id, version')
    .eq('usuario_id', userId)
    .maybeSingle()

  const persistido =
    ctxRes.error || !ctxRes.data
      ? null
      : {
          empresaId: String(ctxRes.data.empresa_id),
          lojaId: ctxRes.data.loja_id == null ? null : String(ctxRes.data.loja_id),
          version: Number(ctxRes.data.version ?? 1),
        }

  const lojaIds = [
    ...new Set(
      vinculos.map((v) => v.lojaId).filter((id): id is string => typeof id === 'string'),
    ),
  ]
  const lojas: Record<string, { empresaId: string }> = {}
  if (lojaIds.length > 0) {
    const lojasRes = await supabase.from('lojas').select('id, empresa_id').in('id', lojaIds)
    for (const row of lojasRes.data ?? []) {
      if (row.empresa_id) lojas[String(row.id)] = { empresaId: String(row.empresa_id) }
    }
  }

  return { available: true, vinculos, persistido, lojas }
}

/** Bloqueio: inativo, sem loja, ou contexto multiempresa inválido (M2-B). */
function resolveBlockedReason(raw: RawSession): SessionBlockedReason | null {
  if (raw.status !== 'authenticated') return null
  if (raw.usuario?.ativo === false) return 'inativo'

  if (raw.tenant?.available) {
    const resolved = resolveTenantForRaw(raw)
    if (!resolved) return 'sem_loja'
    if (!resolved.ok) return mapTenantBlock(resolved.code) ?? 'sem_loja'
    if (resolved.mode === 'legacy_single_loja' && !resolved.lojaId) return 'sem_loja'
    return null
  }

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
