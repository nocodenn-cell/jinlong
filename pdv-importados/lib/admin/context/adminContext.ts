import {
  canAccessAdmin,
  canAccessResource,
  canExecuteAction,
  KNOWN_ACTION_KEYS,
  KNOWN_RESOURCE_KEYS,
} from '@/lib/admin/policy/adminPolicy'
import type { AdminSession } from '@/lib/admin/auth/types'

export type AdminContextRequest = {
  pathname?: string
  resource?: string
  action?: string
}

export type AdminPermissions = {
  accessAdmin: boolean
  actions: Record<string, boolean>
  resources: Record<string, boolean>
}

export type AdminContext = {
  session: AdminSession
  permissions: AdminPermissions
  resourceScope: string | null
  routeScope: string | null
  featureFlags: Record<string, boolean>
  isReadOnlyMode: boolean
}

/**
 * Fonte única: as chaves vêm de `adminPolicy` (RESOURCE_PROFILES / ACTION_PROFILES).
 *
 * Antes existia aqui uma segunda lista literal, que já divergia da política (20 chaves
 * contra 35) — duas fontes de verdade para o mesmo fato, contra o Princípio 1 (Cap. 1).
 * Derivar elimina a divergência por construção.
 */
const KNOWN_ACTIONS = KNOWN_ACTION_KEYS
const KNOWN_RESOURCES = KNOWN_RESOURCE_KEYS

function resolveRouteScope(pathname?: string): string | null {
  if (!pathname?.startsWith('/')) return null
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/gerente')) return null
  return `route:${pathname}`
}

function buildPermissions(session: AdminSession, request: AdminContextRequest): AdminPermissions {
  const actions: Record<string, boolean> = {}
  const resources: Record<string, boolean> = {}

  const actionKeys = new Set<string>(KNOWN_ACTIONS)
  if (request.action) actionKeys.add(request.action)

  for (const action of actionKeys) {
    actions[action] = canExecuteAction(session, action)
  }

  const resourceKeys = new Set<string>(KNOWN_RESOURCES)
  if (request.resource) resourceKeys.add(request.resource)
  const routeScope = resolveRouteScope(request.pathname)
  if (routeScope) resourceKeys.add(routeScope)

  for (const resource of resourceKeys) {
    resources[resource] = canAccessResource(session, resource)
  }

  return {
    accessAdmin: canAccessAdmin(session),
    actions,
    resources,
  }
}

function buildFeatureFlags(session: AdminSession): Record<string, boolean> {
  return {
    painelGerencial: canAccessAdmin(session),
    perfilDono: session.perfil === 'DONO',
    perfilAdmin: session.perfil === 'ADMIN',
    perfilGerente: session.perfil === 'GERENTE',
  }
}

function resolveReadOnlyMode(request: AdminContextRequest): boolean {
  return request.action === undefined && Boolean(request.resource?.startsWith('sensitive:'))
}

/**
 * Agrega contexto de execução admin (sem Supabase, sem redirect, sem gate).
 * Decisões de acesso continuam em adminPolicy + guards.
 */
export function getAdminContext(session: AdminSession, request: AdminContextRequest = {}): AdminContext {
  const routeScope = resolveRouteScope(request.pathname)
  const resourceScope = request.resource ?? routeScope

  return {
    session,
    permissions: buildPermissions(session, request),
    resourceScope,
    routeScope,
    featureFlags: buildFeatureFlags(session),
    isReadOnlyMode: resolveReadOnlyMode(request),
  }
}
