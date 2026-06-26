/**
 * Design System — fonte única de verdade para os contratos de tema, tokens e
 * variantes visuais (Fase 1 do roadmap "Design System + Estabilidade").
 *
 * Objetivo: congelar contratos para que mudanças pequenas não quebrem o sistema
 * inteiro. A UI consome estes contratos em vez de strings soltas — ela não
 * "sabe" o tema, só consome o contrato.
 *
 * Regras:
 *  - Nomes de tema válidos vivem APENAS aqui (APP_THEMES / GERENTE_UI_THEMES).
 *  - Tokens de contrato da UI base: --surface, --surface-text, --accent, --border.
 *  - A marca "dragon" (cores --color-dragon-*, temas dragon-dark/dragon-light) é
 *    legítima e permanece. O guard bloqueia apenas aliases legados soltos
 *    (ex.: classes utilitárias `*-oriental-*`, `bling`).
 */

// --- 1.1 Contrato de tema -------------------------------------------------

/** Tema global da aplicação (atributo `data-app-theme`). Hoje travado em noturno. */
export const APP_THEMES = ['noturno'] as const
export type AppTheme = (typeof APP_THEMES)[number]

/** Tema da área gerente (atributo `data-gerente-ui-theme`), alternável. */
export const GERENTE_UI_THEMES = ['dragon-dark', 'dragon-light'] as const
export type GerenteUiTheme = (typeof GERENTE_UI_THEMES)[number]

/** União única de todos os temas válidos do sistema. */
export const THEMES = [...APP_THEMES, ...GERENTE_UI_THEMES] as const
export type Theme = (typeof THEMES)[number]

/** Atributos `data-*` que carregam o tema no DOM. */
export const THEME_DATA_ATTR = {
  app: 'data-app-theme',
  gerente: 'data-gerente-ui-theme',
} as const

/** Type guard: confirma que uma string é um tema válido do contrato. */
export function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value)
}

// --- 1.2 Contrato de tokens (UI base) ------------------------------------

/**
 * Tokens de contrato que a UI base pode consumir diretamente. A UI não deve
 * depender de tokens específicos de tema (ex.: `--color-dragon-*`, `--jl-*`);
 * estes são a superfície estável que cada tema preenche.
 */
export const UI_CONTRACT_TOKENS = [
  '--surface',
  '--surface-text',
  '--accent',
  '--border',
] as const
export type UiContractToken = (typeof UI_CONTRACT_TOKENS)[number]

// --- 1.3 Contrato de variantes visuais -----------------------------------

/**
 * Tom de superfície dos componentes tabulares da área gerente.
 * `paper`  → superfícies claras; `dragon` → fundos escuros / dragon-glass-card.
 */
export const GERENTE_SURFACE_TONES = ['paper', 'dragon'] as const
export type GerenteSurfaceTone = (typeof GERENTE_SURFACE_TONES)[number]

// --- Guardrails de exaustividade (3.2) -----------------------------------

/**
 * Garante checagem exaustiva em `switch`/`if` de tema ou variante. Se um novo
 * membro for adicionado ao union e não for tratado, o TypeScript falha no build.
 *
 * Uso: `default: return assertNever(theme)`
 */
export function assertNever(value: never): never {
  throw new Error(`Valor de contrato não tratado: ${String(value)}`)
}
