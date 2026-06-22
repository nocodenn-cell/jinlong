/**
 * Factory para temas de Recharts
 * Centraliza configuração de cores, strokes, tooltips para gráficos
 */

import { CHART_UI_COLORS, CHART_THEME_PRESETS, RECHARTS_LABEL_STYLE, RECHARTS_CURSOR_STYLE } from './chartColors'

export type RechartsThemeVariant = 'default' | 'oriental'

/**
 * Retorna configuração de tooltip com cores tokenizadas
 * Usa var() que será resolvido pelo browser
 */
export function getRechartsTooltipStyle(variant: RechartsThemeVariant = 'default') {
  const preset = CHART_THEME_PRESETS[variant]
  return {
    background: CHART_UI_COLORS.tooltipBg,
    border: `1px solid ${CHART_UI_COLORS.tooltipBorder}`,
    borderRadius: 10,
    color: CHART_UI_COLORS.tooltipText,
  }
}

/**
 * Retorna configuração de CartesianGrid com cores tokenizadas
 */
export function getRechartsGridConfig(variant: RechartsThemeVariant = 'default') {
  const preset = CHART_THEME_PRESETS[variant]
  return {
    stroke: preset.gridStroke,
    drawTicks: false as const,
  }
}

/**
 * Retorna configuração de eixo (XAxis, YAxis) com cores tokenizadas
 */
export function getRechartsAxisConfig(variant: RechartsThemeVariant = 'default') {
  const preset = CHART_THEME_PRESETS[variant]
  return {
    tick: { fill: preset.tickColor, fontSize: 12 },
    stroke: preset.gridStroke,
  }
}

/**
 * Configuração completa de tema para um gráfico
 * Agrupa tooltip, grid, axes em um só lugar
 */
export function getRechartsTheme(variant: RechartsThemeVariant = 'default') {
  return {
    tooltip: getRechartsTooltipStyle(variant),
    grid: getRechartsGridConfig(variant),
    axis: getRechartsAxisConfig(variant),
    colors: CHART_THEME_PRESETS[variant].colors,
  }
}

// Re-export from chartColors for backwards compatibility
export { RECHARTS_LABEL_STYLE, RECHARTS_CURSOR_STYLE } from './chartColors'
