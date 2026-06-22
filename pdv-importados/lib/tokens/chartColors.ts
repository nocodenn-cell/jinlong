/**
 * Mapeamento de cores para gráficos Recharts
 * Extrai cores hardcoded para constantes baseadas em design tokens
 */

/**
 * Paleta de cores para gráficos (Donut, Bar, etc)
 * Ordem: Brand Primary, Success, Info, Warning, Secondary, Danger
 */
export const CHART_COLORS = [
  'var(--color-chart-gold)',         // Dragon Gold Warm (#c9a227)
  'var(--color-success-500)',        // Dragon Jade (#10b981)
  '#60a5fa',                         // Blue (data variety - chart-specific)
  'var(--color-warning-500)',        // Dragon Gold 500 (#f59e0b)
  'var(--color-brand-secondary)',    // Dragon Gold 500 (#f59e0b)
  'var(--color-danger-500)',         // Dragon Imperial Red (#ef4444)
] as const

/**
 * Cores de tooltip e UI para Recharts
 * Usadas em contentStyle e labelStyle
 */
export const CHART_UI_COLORS = {
  tooltipBg: 'var(--color-background-tertiary)',      // #111111
  tooltipBorder: 'var(--color-border-secondary)',     // #242424
  tooltipText: 'var(--color-text-secondary)',         // #a3a3a3
  gridStroke: 'rgba(148, 163, 184, 0.18)',            // Slate with 18% opacity
  tickStroke: 'var(--color-text-tertiary)',           // #737373
  svgStroke: 'var(--color-background-secondary)',     // #0f0f0f (dark)
} as const

/**
 * Cores específicas por tipo de status
 * Usadas em sparklines e indicators
 */
export const STATUS_COLORS = {
  success: 'var(--color-success-500)',     // #10b981
  danger: 'var(--color-danger-500)',       // #ef4444
  warning: 'var(--color-warning-500)',     // #f59e0b
  gold: 'var(--color-brand-primary)',      // #fbbf24
} as const

/**
 * Resolve CSS variable para valor hex (runtime)
 * Útil para casos onde Recharts precisa de valor concreto (SVG attributes)
 */
export function resolveColorVar(varName: string): string {
  if (typeof window === 'undefined') return '#fbbf24' // SSR fallback
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
}

/**
 * Presets de temas de gráfico
 * Use com getChartTheme() para aplicar paleta consistente
 */
export const CHART_THEME_PRESETS = {
  default: {
    colors: CHART_COLORS,
    gridStroke: 'rgba(36, 36, 36, 0.6)',  // #242424 with 60% opacity
    tickColor: '#737373',
  },
  oriental: {
    colors: [
      '#c42e2e',                           // Red for oriental variant
      'var(--color-warning-500)',
      'var(--color-success-500)',
    ],
    gridStroke: '#f0f0f0',
    tickColor: '#8c8c8c',
  },
} as const
