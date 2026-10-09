import {
  getCachedAdminNormalization,
} from '@/lib/admin/auth/sessionConsistency'
import type { AdminSession } from '@/lib/admin/auth/types'
import { gerenteAdminDecision, type GerenteDecisionContext } from './gerenteAdapter'

export type GerenteSessionAuth =
  | { ok: true; session: AdminSession }
  | { ok: false; error: string }

const MSG_RECURSO = 'Seu perfil não tem permissão para esta área. Peça a um DONO ou administrador.'
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

  // Sessão gerencial válida, mas o recurso é restrito a outro perfil (ex.: Diagnóstico → DONO/ADMIN):
  // dizer "faça login" seria enganoso — a sessão está boa, falta permissão.
  if (decision.type === 'deny' && decision.reason === 'forbidden_resource' && normalized.session) {
    return { ok: false, error: MSG_RECURSO }
  }

  if (normalized.authState === 'authenticated' && !normalized.session) {
    return { ok: false, error: MSG_PERFIL }
  }

  return { ok: false, error: MSG_LOGIN }
}
