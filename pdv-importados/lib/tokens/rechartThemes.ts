/**
 * Factory para temas de Recharts
 * Centraliza configuração de cores, strokes, tooltips para gráficos
 */

import { CHART_UI_COLORS, CHART_THEME_PRESETS } from './chartColors'

export type RechartsThemeVariant = 'default' | 'oriental'

/**
 * Retorna configuração de tooltip com cores tokenizadas
 * Usa var() que será resolvido pelo browser
 */
export function getRechartsTooltipStyle(variant: RechartsThemeVariant = 'default') {
  void variant
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

/**
 * Estilo de label para tooltip (compatível com Recharts labelStyle prop)
 */
export const RECHARTS_LABEL_STYLE = {
  color: CHART_UI_COLORS.tooltipText,
  fontSize: 12,
} as const

/**
 * Estilo de cursor para tooltip (compatível com Recharts cursor prop)
 */
export const RECHARTS_CURSOR_STYLE = {
  fill: 'rgba(201, 162, 39, 0.12)', // Brand gold with low opacity
}
