import {
  getCachedAdminNormalization,
} from '@/lib/admin/auth/sessionConsistency'
import type { AdminSession } from '@/lib/admin/auth/types'
import { gerenteAdminDecision, type GerenteDecisionContext } from './gerenteAdapter'

export type GerenteSessionAuth =
  | { ok: true; session: AdminSession }
  | { ok: false; error: string }

const MSG_LOGIN = 'Faça login para continuar.'
const MSG_PERFIL = 'Esta área é só para gerente, dono ou administrador. Use uma conta com permissão.'

/**
 * Guard server actions /gerente — delega autorização a adminPolicy via gerenteAdminDecision.
 */
export async function assertGerenteSession(
  context: GerenteDecisionContext = {}
): Promise<GerenteSessionAuth> {
  const normalized = await getCachedAdminNormalization()
  const decision = gerenteAdminDecision(normalized.session, context)

  if (decision.type === 'allow' && normalized.session) {
    return { ok: true, session: normalized.session }
  }

  if (normalized.authState === 'authenticated' && !normalized.session) {
    return { ok: false, error: MSG_PERFIL }
  }

  return { ok: false, error: MSG_LOGIN }
}
