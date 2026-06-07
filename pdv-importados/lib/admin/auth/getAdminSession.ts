import 'server-only'
import { getCachedAdminSession } from './sessionConsistency'
import type { AdminSession } from './types'

/**
 * Sessão admin cacheada para páginas sob layout autenticado.
 * Não redireciona — assume gate em app/admin/layout.tsx.
 */
export async function getAdminSession(): Promise<AdminSession> {
  const session = await getCachedAdminSession()
  if (!session) {
    throw new Error('getAdminSession: sessão admin indisponível (layout gate ausente?)')
  }
  return session
}
