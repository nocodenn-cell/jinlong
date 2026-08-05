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

/**
 * Recursos de governança do tenant — configuração, identidade fiscal, suspensão e
 * remuneração. GERENTE opera a loja; não a administra.
 *
 * Critério (F1-07): restringir **apenas** onde `docs/AUTHORIZATION_MATRIX.md` não concede
 * o acesso a GERENTE e o recurso é administrativo/tenant-level. Onde a matriz concede
 * (financeiro, estoque, vendas, cadastros), GERENTE permanece — RN-016: a permissão
 * efetiva é do banco e a UI apenas reflete; a UI não inventa restrição que o banco não tem.
 */
const DONO_ADMIN_PROFILES: readonly PerfilUsuario[] = ['DONO', 'ADMIN']

/** Actions registradas no painel /admin (server actions). */
const ACTION_PROFILES: Readonly<Record<string, readonly PerfilUsuario[]>> = {
  'estoque:kardex': ALL_ADMIN_PROFILES,
  'vendas:detalhe': ALL_ADMIN_PROFILES,
  'auditoria:listar': ALL_ADMIN_PROFILES,
}

/**
 * Recursos: rotas UI, APIs e dados sensíveis.
 *
 * INVARIANTE (F1-08 / F6-PER-001): **toda** rota sob `app/admin/` tem entrada aqui.
 * Verificado por `adminRouteCoverage.test.ts`, que enumera o filesystem e falha se
 * alguma `page.tsx` não estiver declarada. Rota nova sem política = build vermelho.
 *
 * Segmentos dinâmicos usam a mesma grafia do filesystem (`[id]`); a normalização
 * em `normalizeResourceKey` converte o valor real da URL antes da consulta.
 */
const RESOURCE_PROFILES: Readonly<Record<string, readonly PerfilUsuario[]>> = {
  'route:/admin': ALL_ADMIN_PROFILES,
  'route:/gerente': ALL_ADMIN_PROFILES,
  'route:/admin/dashboard': ALL_ADMIN_PROFILES,
  'route:/admin/catalogo': ALL_ADMIN_PROFILES,
  'route:/admin/catalogo/novo': ALL_ADMIN_PROFILES,
  'route:/admin/categorias-financeiras': ALL_ADMIN_PROFILES,
  'route:/admin/categorias-produtos': ALL_ADMIN_PROFILES,
  'route:/admin/marcas-produtos': ALL_ADMIN_PROFILES,
  'route:/admin/clientes': ALL_ADMIN_PROFILES,
  'route:/admin/funcionarios': ALL_ADMIN_PROFILES,
  /** Identidade fiscal da loja (CNPJ, razão social, IE) — governança do tenant. */
  'route:/admin/implantacao': DONO_ADMIN_PROFILES,
  /** Wizard interno FastProduct — somente perfil ADMIN. */
  'route:/admin/provisionamento': ['ADMIN'] as const,
  'route:/admin/fornecedores': ALL_ADMIN_PROFILES,
  'route:/admin/compras': ALL_ADMIN_PROFILES,
  'route:/admin/financeiro': ALL_ADMIN_PROFILES,
  'route:/admin/financeiro/contas-pagar': ALL_ADMIN_PROFILES,
  'route:/admin/financeiro/documento/[id]': ALL_ADMIN_PROFILES,
  /** Remuneração de funcionário — dado sensível, fora da operação diária do gerente. */
  'route:/admin/comissoes': DONO_ADMIN_PROFILES,
  'route:/admin/vendas': ALL_ADMIN_PROFILES,
  'route:/admin/relatorios': ALL_ADMIN_PROFILES,
  'route:/admin/auditoria': ALL_ADMIN_PROFILES,
  'route:/admin/estoque': ALL_ADMIN_PROFILES,
  'route:/admin/estoque/importar-nfe': ALL_ADMIN_PROFILES,
  'route:/admin/estoque/imprimir-etiquetas': ALL_ADMIN_PROFILES,
  'route:/admin/estoque/recebimento': ALL_ADMIN_PROFILES,
  'route:/admin/estoque/transferencias': ALL_ADMIN_PROFILES,
  /** Parametrização da loja (regime tributário, limites, chaves) — governança do tenant. */
  'route:/admin/configuracoes': DONO_ADMIN_PROFILES,
  /** Suspende a operação da loja — ação de nível tenant, nunca operacional. */
  'route:/admin/suspensao': DONO_ADMIN_PROFILES,
  'route:/admin/diagnostico-caixa': ALL_ADMIN_PROFILES,
  'api:gerente:health': ALL_ADMIN_PROFILES,
  'api:gerente:atividades:recent': ALL_ADMIN_PROFILES,
  'api:gerente:atividades:history': ALL_ADMIN_PROFILES,
  'api:gerente:fila:status': ALL_ADMIN_PROFILES,
  'api:gerente:notificacoes:count': ALL_ADMIN_PROFILES,
  /**
   * Mantido em ALL_ADMIN por decisão explícita: `docs/AUTHORIZATION_MATRIX.md` concede a
   * GERENTE `contas_receber` SELECT ("todas da loja") e `registrar_liquidacao_receber`
   * EXECUTE ("sim"). Negar na UI o que o banco concede violaria RN-016 e quebraria um
   * requisito entregue do piloto (Contas a receber / a pagar). Ver nota em F1-07.
   */
  'sensitive:financeiro': ALL_ADMIN_PROFILES,
  'sensitive:comissoes': DONO_ADMIN_PROFILES,
}

/** Chaves de recurso declaradas — fonte única para consumidores (ex.: adminContext). */
export const KNOWN_RESOURCE_KEYS: readonly string[] = Object.freeze(
  Object.keys(RESOURCE_PROFILES)
)

/** Actions declaradas — fonte única para consumidores. */
export const KNOWN_ACTION_KEYS: readonly string[] = Object.freeze(Object.keys(ACTION_PROFILES))

/** Segmento de URL que corresponde a um parâmetro dinâmico (`[id]`) do App Router. */
const DYNAMIC_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i

/**
 * Converte a chave de recurso vinda da URL real na chave declarada em RESOURCE_PROFILES.
 *
 * - Segmentos dinâmicos (UUID ou numérico) viram `[id]`, casando com a grafia do filesystem.
 * - `/gerente/**` colapsa em `route:/gerente`: todas as rotas sob `/gerente` são shims de
 *   redirect para `/admin` (`app/gerente/[...path]/page.tsx`), não superfícies próprias.
 */
export function normalizeResourceKey(resource: string): string {
  if (!resource.startsWith('route:')) return resource
  const raw = resource.slice('route:'.length)
  // Barra final não muda a rota — `/admin/vendas/` é `/admin/vendas`.
  const pathname = raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw

  if (pathname === '/gerente' || pathname.startsWith('/gerente/')) return 'route:/gerente'

  const normalized = pathname
    .split('/')
    .map((segment) => (DYNAMIC_SEGMENT.test(segment) ? '[id]' : segment))
    .join('/')

  return `route:${normalized}`
}

/**
 * F1-08 — fallback é **deny**.
 *
 * Antes, recurso ou action não declarado caía em `canAccessAdmin(session)`, ou seja:
 * qualquer perfil gerencial era liberado. Isso transformava esquecimento em permissão —
 * uma rota nova nascia acessível a GERENTE sem ninguém decidir nada, e foi assim que
 * `configuracoes` e `suspensao` ficaram abertas.
 *
 * Agora o desconhecido é negado. A contrapartida obrigatória é a cobertura completa,
 * garantida por `adminRouteCoverage.test.ts`: rota sem política falha o build, em vez
 * de falhar em produção.
 */
function hasAllowedPerfil(
  session: AdminSession,
  allowed: readonly PerfilUsuario[] | undefined
): boolean {
  if (!allowed) return false
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
  return hasAllowedPerfil(session, RESOURCE_PROFILES[normalizeResourceKey(resource)])
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
  if (authState === 'blocked') {
    // Conta desativada (usuarios.ativo = false) ou sem loja vinculada: não entra
    // em nenhuma rota protegida — nem painel, nem /caixa.
    return isProtectedRoute(pathname)
      ? redirect(
          loginPath(pathname),
          normalized.blockedReason === 'inativo' ? 'conta_inativa' : 'conta_sem_loja',
          'edge'
        )
      : allow('blocked_public_route', 'edge')
  }
  if (isProtectedRoute(pathname) && authState === 'anonymous') {
    return redirect(loginPath(pathname), 'unauthenticated', 'edge')
  }

  if (authState === 'authenticated') {
    const painelAllowed = session !== null && canAccessAdmin(session)
    if (isPainelWeb(pathname) && !painelAllowed) {
      return redirect('/caixa', 'perfil_nao_gerencial', 'edge')
    }
    // F1-07 / F1-08 — autorização **por recurso**, não apenas "é perfil gerencial".
    //
    // Sem isto, RESOURCE_PROFILES seria tabela inerte: `loadAdminContext` calcula as
    // permissões mas nenhum consumidor as aplica, e `/admin/suspensao` sequer chama gate.
    // O middleware é o único ponto por onde toda navegação /admin passa — é aqui que a
    // política decide. Páginas e actions continuam responsáveis pelas suas próprias
    // checagens de escrita; este é o piso, não o teto.
    if (session !== null && pathname.startsWith('/admin')) {
      if (!canAccessResource(session, `route:${pathname}`)) {
        return redirect('/admin', 'perfil_sem_acesso_recurso', 'edge')
      }
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
