import { resolveAdminSession } from './resolveAdminSession'
import type { AdminSession } from './types'

export type AdminAuthResult = { ok: true; session: AdminSession } | { ok: false; error: string }

/**
 * Guard para Server Actions e APIs — sem redirect.
 */
export async function assertAdminSession(): Promise<AdminAuthResult> {
  const session = await resolveAdminSession()
  if (!session) {
    return { ok: false, error: 'Não autorizado.' }
  }
  return { ok: true, session }
}
