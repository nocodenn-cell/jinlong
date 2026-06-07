import 'server-only'
import { resolveAdminSession } from './resolveAdminSession'
import type { AdminSession } from './types'

/**
 * Contexto admin cacheado para páginas sob layout autenticado.
 * Não redireciona — assume gate em app/admin/layout.tsx.
 */
export async function getAdminContext(): Promise<AdminSession> {
  const session = await resolveAdminSession()
  if (!session) {
    throw new Error('getAdminContext: sessão admin indisponível (layout gate ausente?)')
  }
  return session
}
