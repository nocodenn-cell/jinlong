/**
 * UI Tokens — Cores semânticas.
 *
 * Fonte de verdade em runtime: variáveis CSS definidas em
 * `styles/tokens/base.css` e `styles/tokens/semantic.css`.
 *
 * Este módulo expõe uma superfície TS tipada para essas decisões visuais.
 * Use `colors.*` em `style={{ ... }}` ou onde Tailwind não alcança (ex.:
 * configuração de gráficos, canvas). NÃO há React aqui — apenas valores.
 *
 * Cada valor é uma referência `var(--token)` para que o tema continue
 * resolvido em runtime pelo CSS (suporta troca de tema/contexto). Para
 * casos que exigem o hex literal em JS (Chart.js, sparkline em canvas),
 * use `primitiveHex` que espelha os primitivos de `base.css`.
 */

const v = (name: string): string => `var(${name})`

export const colors = {
  success: {
    50: v("--color-success-50"),
    100: v("--color-success-100"),
    500: v("--color-success-500"),
    600: v("--color-success-600"),
    700: v("--color-success-700"),
    900: v("--color-success-900"),
  },
  warning: {
    50: v("--color-warning-50"),
    100: v("--color-warning-100"),
    400: v("--color-warning-400"),
    500: v("--color-warning-500"),
    600: v("--color-warning-600"),
    700: v("--color-warning-700"),
    900: v("--color-warning-900"),
  },
  danger: {
    50: v("--color-danger-50"),
    100: v("--color-danger-100"),
    500: v("--color-danger-500"),
    600: v("--color-danger-600"),
    700: v("--color-danger-700"),
    900: v("--color-danger-900"),
  },
  background: {
    primary: v("--color-background-primary"),
    secondary: v("--color-background-secondary"),
    tertiary: v("--color-background-tertiary"),
    surface: v("--color-background-surface"),
    surfaceSoft: v("--color-background-surface-soft"),
    overlay: v("--color-background-overlay"),
  },
  text: {
    primary: v("--color-text-primary"),
    secondary: v("--color-text-secondary"),
    tertiary: v("--color-text-tertiary"),
    inverse: v("--color-text-inverse"),
    disabled: v("--color-text-disabled"),
  },
  border: {
    primary: v("--color-border-primary"),
    secondary: v("--color-border-secondary"),
    focus: v("--color-border-focus"),
    disabled: v("--color-border-disabled"),
  },
  brand: {
    primary: v("--color-brand-primary"),
    secondary: v("--color-brand-secondary"),
    strong: v("--color-brand-strong"),
    contrast: v("--color-brand-contrast"),
  },
  chart: {
    gold: v("--color-chart-gold"),
  },
} as const

/**
 * Hex literais dos primitivos (espelho de `styles/tokens/base.css`).
 * Use apenas onde o navegador NÃO resolve `var()` por nós — bibliotecas de
 * gráfico em canvas (Chart.js) ou geração de imagem. Para qualquer DOM/CSS,
 * prefira `colors.*`.
 */
export const primitiveHex = {
  jade: { 50: "#ecfdf5", 100: "#d1fae5", 500: "#10b981", 600: "#059669", 700: "#047857", 900: "#064e3b" },
  gold: { 50: "#fffbeb", 100: "#fef3c7", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 900: "#78350f", warm: "#c9a227" },
  imperialRed: { 50: "#fef2f2", 100: "#fee2e2", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 900: "#7f1d1d" },
  night: { 50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a", 950: "#020617" },
} as const

export type Colors = typeof colors
