import { getCachedAdminSession } from '@/lib/admin/auth/sessionConsistency'
import type { AdminSession } from '@/lib/admin/auth/types'

/** Identidade de sessão já normalizada (após assertGerenteSession ou layout gate). */
export async function getGerenteSession(): Promise<AdminSession | null> {
  return getCachedAdminSession()
}

export async function getGerenteUserId(): Promise<string | null> {
  const session = await getCachedAdminSession()
  return session?.userId ?? null
}

/**
 * Loja da sessão — sem fallback LOJA_MATRIZ_ID (M2-B F1/F3).
 * Ausência de loja → null (caller deve falhar fechado).
 */
export async function getGerenteLojaId(): Promise<string | null> {
  const session = await getCachedAdminSession()
  if (!session) return null
  return session.lojaId ?? null
}

/** Empresa ativa da sessão (null em modo legado sem vínculos). */
export async function getGerenteEmpresaId(): Promise<string | null> {
  const session = await getCachedAdminSession()
  return session?.empresaId ?? null
}
