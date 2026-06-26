import { ROUTES } from '@shared-core/navigation/routes'

/**
 * Registro central de temas por módulo/rota.
 *
 * MODELO MENTAL (um só): cada rota mapeia para UM tema; o tema é projetado na
 * subárvore via `data-theme` (AdminThemeScope) e o CSS reatribui os tokens.
 * O tema base `dragon` é o comportamento não-escopado (sem atributo).
 *
 * EXTENSIBILIDADE SEM TETO:
 *  • Novos temas: `ThemeId` é string aberta — adicionar um tema NÃO mexe neste
 *    arquivo nem no AdminThemeScope. Basta:
 *      1) criar `styles/tokens/<tema>/` escopado em `[data-theme='<tema>']`;
 *      2) importá-lo no layout;
 *      3) apontar a rota para ele no array `MODULES` (`theme: '<tema>'`).
 *  • Metadata por módulo é OPCIONAL e livre (`meta`) — telemetria, tenant,
 *    flags futuras — sem obrigar quem só quer "1 tema por rota".
 *  • Multi-tenant: a resolução é uma função pura; quando houver contexto de
 *    tenant, basta estendê-la com um parâmetro opcional (mudança aditiva,
 *    não-quebrante). Hoje resolvemos por rota, que cobre o caso atual.
 */

/**
 * Identificador de tema. String aberta de propósito: temas são DADOS, não um
 * union fechado que exigiria refactor a cada novo tema. Os ids conhecidos são
 * documentados aqui apenas como referência.
 *
 * Conhecidos: 'dragon' (base/atual) · 'classico' (Bling). Futuros: 'premium', etc.
 */
export type ThemeId = string

/** Tema base (não-escopado). Telas não listadas em `MODULES` usam este. */
export const DEFAULT_THEME: ThemeId = 'classico'

/** Tema assumido por uma entrada migrada que não declara `theme` explicitamente. */
const MIGRATED_DEFAULT_THEME: ThemeId = 'classico'

/** Metadata opcional e extensível por módulo. Nada aqui é obrigatório. */
export interface ModuleMeta {
  /** Rótulo legível (checklist de migração, telemetria). */
  readonly label?: string
  /** Campos adicionais livres — mantém o modelo aberto sem quebrar tipos. */
  readonly [key: string]: unknown
}

export interface ThemeModule {
  /** Rota raiz; cobre a própria rota e suas sub-rotas. */
  readonly route: string
  /** Tema da subárvore. Omisso ⇒ `classico` (caminho feliz: basta a rota). */
  readonly theme?: ThemeId
  /** Metadata opcional. */
  readonly meta?: ModuleMeta
}

/**
 * Módulos migrados. CAMINHO FELIZ = só a rota (assume tema Clássico).
 * Para migrar um módulo: adicione UMA entrada aqui.
 */
const MODULES: readonly ThemeModule[] = [
  { route: ROUTES.admin.dashboard, meta: { label: 'Dashboard' } },
  // Exemplos de evolução (sem refactor):
  // { route: ROUTES.admin.produtos, theme: 'classico', meta: { label: 'Produtos' } },
  // { route: ROUTES.admin.premiumArea, theme: 'premium', meta: { tenant: 'acme' } },
]

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`)
}

function findModule(pathname: string): ThemeModule | undefined {
  return MODULES.find((module) => matchesRoute(pathname, module.route))
}

/** Tema efetivo de uma rota (sempre retorna um id; `DEFAULT_THEME` se não migrada). */
export function resolveTheme(pathname: string): ThemeId {
  const module = findModule(pathname)
  if (!module) return DEFAULT_THEME
  return module.theme ?? MIGRATED_DEFAULT_THEME
}

/** Metadata opcional do módulo da rota (ou `undefined`). */
export function getModuleMeta(pathname: string): ModuleMeta | undefined {
  return findModule(pathname)?.meta
}
