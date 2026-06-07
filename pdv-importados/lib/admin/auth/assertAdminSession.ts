import {
  getAdminContext,
  type AdminContext,
  type AdminContextRequest,
} from '@/lib/admin/context/adminContext'
import { actionAdminDecision } from '@/lib/admin/policy/adminPolicy'
import { getCachedAdminSession } from './sessionConsistency'
import type { AdminSession } from './types'

export type AdminAuthResult =
  | { ok: true; session: AdminSession; context: AdminContext }
  | { ok: false; error: string }

/**
 * Guard para Server Actions — sem redirect.
 * Retorna sessão + contexto agregado quando autorizado.
 */
export async function assertAdminSession(
  action?: string,
  request: Omit<AdminContextRequest, 'action'> = {}
): Promise<AdminAuthResult> {
  const session = await getCachedAdminSession()
  const decision = actionAdminDecision(session, action)

  if (decision.type !== 'allow' || !session) {
    return {
      ok: false,
      error: decision.reason === 'forbidden_action' ? 'Ação não permitida.' : 'Não autorizado.',
    }
  }

  const context = getAdminContext(session, { ...request, action })
  return { ok: true, session, context }
}
