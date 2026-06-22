export type SparkTone = 'success' | 'danger' | 'warning' | 'gold'

/**
 * Token references for sparkline colors.
 * Resolved at runtime from CSS variables.
 */
const SPARK_COLOR_TOKENS: Record<SparkTone, string> = {
  success: '--color-success-500',      // #10b981 (Dragon Jade)
  danger: '--color-danger-500',        // #ef4444 (Dragon Imperial Red)
  warning: '--color-warning-500',      // #f59e0b (Dragon Gold)
  gold: '--color-brand-primary',       // #fbbf24 (Dragon Gold Primary)
}

/**
 * Fallback colors if CSS variables are not available (e.g., SSR, test environments)
 */
const SPARK_COLORS_FALLBACK: Record<SparkTone, string> = {
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  gold: '#fbbf24',
}

/**
 * Resolves a CSS variable to its computed hex value.
 * Falls back to predefined value if variable not found.
 */
function resolveColorToken(tokenName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim()
    return value || fallback
  } catch {
    return fallback
  }
}

function withAlpha(color: string, alpha: number): string {
  const c = color.trim()
  if (c.startsWith('#')) {
    let hex = c.slice(1)
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((ch) => ch + ch)
        .join('')
    }
    const num = parseInt(hex, 16)
    const r = (num >> 16) & 255
    const g = (num >> 8) & 255
    const b = num & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return c
}

export function sparkColor(tone: SparkTone): string {
  const tokenName = SPARK_COLOR_TOKENS[tone]
  const fallback = SPARK_COLORS_FALLBACK[tone]
  return resolveColorToken(tokenName, fallback)
}

export function drawSparkline(canvas: HTMLCanvasElement, data: number[], color: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.clientWidth
  const cssH = canvas.clientHeight
  if (cssW <= 0 || cssH <= 0) return

  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)

  if (data.length < 2) return

  const pad = 3
  const w = cssW - pad * 2
  const h = cssH - pad * 2
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = w / (data.length - 1)

  const points = data.map((v, i) => ({
    x: pad + i * stepX,
    y: pad + h - ((v - min) / range) * h,
  }))

  const first = points[0]!
  const last = points[points.length - 1]!

  const grad = ctx.createLinearGradient(0, pad, 0, pad + h)
  grad.addColorStop(0, withAlpha(color, 0.24))
  grad.addColorStop(1, withAlpha(color, 0))
  ctx.beginPath()
  ctx.moveTo(first.x, pad + h)
  for (const p of points) ctx.lineTo(p.x, p.y)
  ctx.lineTo(last.x, pad + h)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  ctx.beginPath()
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(last.x, last.y, 2, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}
