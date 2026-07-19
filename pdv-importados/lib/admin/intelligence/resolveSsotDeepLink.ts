import { ROUTES } from '@shared-core/navigation/routes'

/**
 * Prefixos entity-SSoT / operações oficiais.
 * A UI só navega; não cria CRUD paralelo.
 */
const ALLOWED_PREFIXES: readonly string[] = [
  ROUTES.admin.catalogo,
  ROUTES.admin.estoque,
  ROUTES.admin.vendas,
  ROUTES.admin.financeiro,
  ROUTES.admin.clientes,
  ROUTES.admin.fornecedores,
  ROUTES.admin.importNfe,
  ROUTES.admin.compras,
  ROUTES.caixa.home,
]

/**
 * Valida deepLinkHint já projetado pelo Read Model / Core.
 * Não interpreta negócio — apenas permite rotas SSoT conhecidas.
 */
export function resolveSsotDeepLink(hint: string | null | undefined): string | null {
  if (!hint?.startsWith('/')) return null
  const pathOnly = hint.split('?')[0] ?? hint
  const ok = ALLOWED_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
  )
  return ok ? hint : null
}
