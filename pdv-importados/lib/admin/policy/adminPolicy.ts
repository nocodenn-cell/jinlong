import { isPerfilPainelGerencial } from '@/lib/auth/painelGerencial'
import type { PerfilUsuario } from '@/idioma/normalizePerfilUsuario'
import type { AdminSession, SessionNormalization } from '@/lib/admin/auth/types'

/** Escopo da decisão — única fonte de verdade para autorização /admin e /gerente. */
export type DecisionScope = 'edge' | 'api' | 'action' | 'resource' | 'gerente'

/** Objeto de decisão unificado retornado por adminPolicy. */
export type Decision = {
  type: 'allow' | 'redirect' | 'deny'
  target: string | null
  reason: string
  scope: DecisionScope
}

export type AdminPolicyDecision = {
  allowed: boolean
  reason?: string
}

export type MiddlewareDecisionContext = {
  configOk?: boolean
}

function allow(reason: string, scope: DecisionScope): Decision {
  return { type: 'allow', target: null, reason, scope }
}

function redirect(target: string, reason: string, scope: DecisionScope): Decision {
  return { type: 'redirect', target, reason, scope }
}

function deny(reason: string, scope: DecisionScope): Decision {
  return { type: 'deny', target: null, reason, scope }
}

function loginPath(pathname: string): string {
  const params = new URLSearchParams({ next: pathname })
  return `/login?${params.toString()}`
}

function isProtectedRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/gerente') ||
    pathname === '/caixa' ||
    pathname.startsWith('/caixa/')
  )
}

function isPainelWeb(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/gerente')
}

const ALL_ADMIN_PROFILES: readonly PerfilUsuario[] = ['GERENTE', 'DONO', 'ADMIN']

/** Actions registradas no painel /admin (server actions). */
const ACTION_PROFILES: Readonly<Record<string, readonly PerfilUsuario[]>> = {
  'estoque:kardex': ALL_ADMIN_PROFILES,
  'vendas:detalhe': ALL_ADMIN_PROFILES,
}

/** Recursos: rotas UI, APIs e dados sensíveis. */
const RESOURCE_PROFILES: Readonly<Record<string, readonly PerfilUsuario[]>> = {
  'route:/admin': ALL_ADMIN_PROFILES,
  'route:/gerente': ALL_ADMIN_PROFILES,
  'route:/admin/dashboard': ALL_ADMIN_PROFILES,
  'route:/admin/catalogo': ALL_ADMIN_PROFILES,
  'route:/admin/vendas': ALL_ADMIN_PROFILES,
  'route:/admin/estoque': ALL_ADMIN_PROFILES,
  'api:gerente:health': ALL_ADMIN_PROFILES,
  'api:gerente:atividades:recent': ALL_ADMIN_PROFILES,
  'api:gerente:atividades:history': ALL_ADMIN_PROFILES,
  'api:gerente:fila:status': ALL_ADMIN_PROFILES,
  'api:gerente:notificacoes:count': ALL_ADMIN_PROFILES,
  'sensitive:financeiro': ALL_ADMIN_PROFILES,
  'sensitive:comissoes': ALL_ADMIN_PROFILES,
}

function hasAllowedPerfil(
  session: AdminSession,
  allowed: readonly PerfilUsuario[] | undefined
): boolean {
  if (!allowed) return canAccessAdmin(session)
  return allowed.includes(session.perfil)
}

/**
 * Pode acessar o painel /admin (identidade + perfil gerencial).
 * Regra interna — consumidores devem usar Decision via adapters.
 */
export function canAccessAdmin(session: AdminSession): boolean {
  return Boolean(session.userId) && isPerfilPainelGerencial(session.perfil)
}

export function canExecuteAction(session: AdminSession, action: string): boolean {
  if (!canAccessAdmin(session)) return false
  return hasAllowedPerfil(session, ACTION_PROFILES[action])
}

export function canAccessResource(session: AdminSession, resource: string): boolean {
  if (!canAccessAdmin(session)) return false
  return hasAllowedPerfil(session, RESOURCE_PROFILES[resource])
}

export function canAccessRoute(session: AdminSession | null, route: string): boolean {
  if (!route.startsWith('/admin') && !route.startsWith('/gerente')) return true
  return session !== null && canAccessAdmin(session)
}

/** Deriva lista de permissões do contrato a partir da sessão normalizada. */
export function derivePermissionsForSession(session: AdminSession): string[] {
  if (!canAccessAdmin(session)) return []
  const permissions: string[] = []
  for (const [action, profiles] of Object.entries(ACTION_PROFILES)) {
    if (profiles.includes(session.perfil)) permissions.push(`action:${action}`)
  }
  for (const [resource, profiles] of Object.entries(RESOURCE_PROFILES)) {
    if (profiles.includes(session.perfil)) permissions.push(`resource:${resource}`)
  }
  return permissions
}

/**
 * Autoridade edge — única decisão de rota/sessão para middleware.
 * Consome apenas SessionNormalization (sem leitura direta de raw).
 */
export function middlewareAdminDecision(
  normalized: SessionNormalization,
  pathname: string,
  context: MiddlewareDecisionContext = {}
): Decision {
  const { configOk = true } = context
  const { session, authState } = normalized

  if (!configOk) {
    return isProtectedRoute(pathname)
      ? redirect(loginPath(pathname), 'supabase_config_missing', 'edge')
      : allow('config_optional_route', 'edge')
  }

  if (authState === 'stale') {
    return redirect(loginPath(pathname), 'session_stale', 'edge')
  }
  if (authState === 'auth_error') {
    return isProtectedRoute(pathname)
      ? redirect(loginPath(pathname), 'auth_error', 'edge')
      : allow('auth_error_public_route', 'edge')
  }
  if (authState === 'db_error') {
    return isProtectedRoute(pathname)
      ? redirect(loginPath(pathname), 'db_error', 'edge')
      : allow('db_error_public_route', 'edge')
  }
  if (isProtectedRoute(pathname) && authState === 'anonymous') {
    return redirect(loginPath(pathname), 'unauthenticated', 'edge')
  }

  if (authState === 'authenticated') {
    const painelAllowed = session !== null && canAccessAdmin(session)
    if (isPainelWeb(pathname) && !painelAllowed) {
      return redirect('/caixa', 'perfil_nao_gerencial', 'edge')
    }
    // GERENTE/DONO/ADMIN podem abrir o PDV (/caixa) — "Ir para PDV" sempre funciona.
    // Antes havia um redirect `gerente_em_caixa` para /gerente que bloqueava o acesso.
    return allow('authorized', 'edge')
  }

  if (!pathname.startsWith('/admin') && !pathname.startsWith('/gerente')) {
    return allow('non_painel_route', 'edge')
  }
  if (session !== null && canAccessAdmin(session)) {
    return allow('authorized', 'edge')
  }
  return redirect(loginPath(pathname), 'unauthorized', 'edge')
}

/** Booleano derivado — apenas testes e diagnóstico. */
export function middlewareAllowsAccess(
  normalized: SessionNormalization,
  pathname: string
): boolean {
  return middlewareAdminDecision(normalized, pathname).type === 'allow'
}

/** Autoridade API — deriva de canAccessAdmin/canAccessResource. */
export function apiAdminDecision(session: AdminSession | null, resource?: string): Decision {
  if (session === null || !canAccessAdmin(session)) {
    return deny('unauthorized', 'api')
  }
  if (resource && !canAccessResource(session, resource)) {
    return deny('forbidden_resource', 'api')
  }
  return allow('authorized', 'api')
}

/** Autoridade action — deriva de canAccessAdmin/canExecuteAction. */
export function actionAdminDecision(session: AdminSession | null, action?: string): Decision {
  if (session === null || !canAccessAdmin(session)) {
    return deny('unauthorized', 'action')
  }
  if (action && !canExecuteAction(session, action)) {
    return deny('forbidden_action', 'action')
  }
  return allow('authorized', 'action')
}

export function toPolicyDecision(allowed: boolean, reason?: string): AdminPolicyDecision {
  return allowed ? { allowed: true } : { allowed: false, reason }
}
