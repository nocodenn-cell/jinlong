import { getCachedAdminSession } from '@/lib/admin/auth/sessionConsistency'
import { LOJA_MATRIZ_ID } from '@/lib/auth/lojaUsuario'
import type { AdminSession } from '@/lib/admin/auth/types'

/** Identidade de sessão já normalizada (após assertGerenteSession ou layout gate). */
export async function getGerenteSession(): Promise<AdminSession | null> {
  return getCachedAdminSession()
}

export async function getGerenteUserId(): Promise<string | null> {
  const session = await getCachedAdminSession()
  return session?.userId ?? null
}

export async function getGerenteLojaId(): Promise<string | null> {
  const session = await getCachedAdminSession()
  if (!session) return null
  return session.lojaId ?? LOJA_MATRIZ_ID
}
