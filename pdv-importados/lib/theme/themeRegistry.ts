import { ROUTES } from '@shared-core/navigation/routes'

/**
 * Registro central das rotas já migradas para o tema Clássico (Design System
 * estilo Bling). Fonte única da verdade — para migrar um módulo, adicione a
 * rota aqui; nenhuma lista é duplicada pelos componentes.
 *
 * As demais rotas permanecem no tema atual (Dragon), que é o comportamento base
 * não-escopado. O tema é projetado no DOM por `AdminThemeScope` via `data-theme`.
 */
export const CLASSICO_ROUTES: readonly string[] = [ROUTES.admin.dashboard]

/** A rota informada (ou uma sub-rota dela) já usa o tema Clássico? */
export function isClassicoPath(pathname: string): boolean {
  return CLASSICO_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}
