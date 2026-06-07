import {
  actionAdminDecision,
  apiAdminDecision,
  type Decision,
} from '@/lib/admin/policy/adminPolicy'
import type { AdminSession } from '@/lib/admin/auth/types'

export type GerenteDecisionContext = {
  action?: string
  resource?: string
}

function withGerenteScope(decision: Decision): Decision {
  return { ...decision, scope: 'gerente' }
}

/**
 * Adapter de compatibilidade /gerente → adminPolicy.
 * Sem regras próprias: delega action/api decision e reetiqueta scope.
 */
export function gerenteAdminDecision(
  session: AdminSession | null,
  context: GerenteDecisionContext = {}
): Decision {
  if (context.action) {
    return withGerenteScope(actionAdminDecision(session, context.action))
  }
  if (context.resource) {
    return withGerenteScope(apiAdminDecision(session, context.resource))
  }
  return withGerenteScope(actionAdminDecision(session))
}
