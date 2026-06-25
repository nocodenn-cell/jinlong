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
    lineSuccess: resolveCSSVariable('--color-brand-primary', '#1a56db'),
    pointSuccess: resolveCSSVariable('--color-brand-primary', '#1a56db'),

    tooltipBg: resolveCSSVariable('--color-background-secondary', '#ffffff'),
    tooltipBorder: resolveCSSVariable('--color-border-secondary', '#e2e8f0'),
    tooltipTitleColor: resolveCSSVariable('--color-text-secondary', '#334155'),
    tooltipBodyColor: resolveCSSVariable('--color-text-primary', '#0f172a'),

    gridColor: 'rgba(226, 232, 240, 0.8)',
    tickColor: resolveCSSVariable('--color-text-tertiary', '#64748b'),
  }
}

/**
 * Gradiente para Chart.js canvas
 * Cria gradiente com cor de sucesso (jade)
 */
export function createSuccessGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, 0, 0, 140)
  const successColor = resolveCSSVariable('--color-brand-primary', '#1a56db')

  // Parse hex to rgba
  const hex = successColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)

  gradient.addColorStop(0, `rgba(${r},${g},${b},0.18)`)
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)

  return gradient
}
