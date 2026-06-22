/**
 * Tema Chart.js com cores baseadas em design tokens
 * Chart.js não resolve CSS variables, então precisamos resolver em runtime
 */

/**
 * Resolve CSS variable color para valor hex
 * Usado por Chart.js que não pode resolver CSS variables diretamente
 */
function resolveCSSVariable(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
    return value || fallback
  } catch {
    return fallback
  }
}

/**
 * Configuração de cores para Chart.js
 * Resolve tokens em tempo de inicialização do chart
 */
export function getChartJsTheme() {
  return {
    // Success (green) line for hourly sales
    lineSuccess: resolveCSSVariable('--color-success-500', '#10b981'),
    pointSuccess: resolveCSSVariable('--color-success-500', '#10b981'),

    // Tooltip styling
    tooltipBg: resolveCSSVariable('--color-background-secondary', '#111111'),
    tooltipBorder: resolveCSSVariable('--color-border-secondary', '#242424'),
    tooltipTitleColor: resolveCSSVariable('--color-text-secondary', '#a3a3a3'),
    tooltipBodyColor: resolveCSSVariable('--color-text-primary', '#fafafa'),

    // Grid and axes
    gridColor: 'rgba(34,197,94,0.15)', // Success color with 15% opacity
    tickColor: resolveCSSVariable('--color-text-tertiary', '#737373'),
  }
}

/**
 * Gradiente para Chart.js canvas
 * Cria gradiente com cor de sucesso (jade)
 */
export function createSuccessGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, 0, 0, 140)
  const successColor = resolveCSSVariable('--color-success-500', '#22c55e')

  // Parse hex to rgba
  const hex = successColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)

  gradient.addColorStop(0, `rgba(${r},${g},${b},0.18)`)
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)

  return gradient
}
