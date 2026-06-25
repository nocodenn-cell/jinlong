import { ROUTES } from '@shared-core/navigation/routes'

/**
 * Registro central de temas da aplicação.
 *
 * Fonte única da verdade sobre QUAIS módulos já foram migrados para o tema
 * Clássico (Design System estilo Bling). À medida que a migração avança, basta
 * adicionar uma entrada em `CLASSICO_MODULES` — nenhuma lista de rotas precisa
 * ser duplicada por componentes.
 *
 * O tema é aplicado por escopo (`data-theme="classico"`) sobre a subárvore da
 * rota; os módulos ainda não migrados permanecem no tema atual ("dragon").
 */

export type AppTheme = 'classico' | 'dragon'

/** Tema padrão das telas ainda não migradas. */
export const DEFAULT_THEME: AppTheme = 'dragon'

export interface ClassicoModule {
  /** Identificador estável do módulo (para logs/telemetria/checklist). */
  readonly id: string
  /** Rótulo legível do módulo. */
  readonly label: string
  /** Rota raiz do módulo; cobre a própria rota e suas sub-rotas. */
  readonly route: string
}

/**
 * Módulos cuja interface já usa exclusivamente o Design System Clássico.
 *
 * ➜ Para migrar um novo módulo: adicione-o aqui (e nada mais no roteamento).
 */
export const CLASSICO_MODULES: readonly ClassicoModule[] = [
  { id: 'dashboard', label: 'Dashboard', route: ROUTES.admin.dashboard },
] as const

function matchesModule(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

/** O módulo da rota informada já está no tema Clássico? */
export function isClassicoPath(pathname: string): boolean {
  return CLASSICO_MODULES.some((module) => matchesModule(pathname, module.route))
}

/** Resolve o tema efetivo para uma rota. */
export function resolveTheme(pathname: string): AppTheme {
  return isClassicoPath(pathname) ? 'classico' : DEFAULT_THEME
}
