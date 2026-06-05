'use client'

/**
 * FastProduct Admin — MetricCard com sparkline (Fase 2)
 *
 * Card de KPI do painel /admin. O sparkline é desenhado com Canvas API pura
 * (sem Chart.js / Recharts) — linha 1.5px + gradiente de preenchimento sob a
 * curva, conforme spec do design system.
 *
 * IMPORTANTE: este componente NÃO faz query. Os dados chegam prontos por
 * `sparkData: number[]`, montados no Server Component que o renderiza
 * (ex.: app/admin/dashboard/page.tsx).
 */

import { useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DeltaChip } from './badges'

export type SparkTone = 'success' | 'danger' | 'info' | 'purple' | 'warning'

const SPARK_TOKEN: Record<SparkTone, { varName: string; fallback: string }> = {
  success: { varName: '--fp-success', fallback: '#22c55e' },
  danger: { varName: '--fp-danger', fallback: '#ef4444' },
  info: { varName: '--fp-info', fallback: '#3b82f6' },
  purple: { varName: '--fp-purple', fallback: '#8b5cf6' },
  warning: { varName: '--fp-warning', fallback: '#f59e0b' },
}

type MetricCardProps = {
  /** Rótulo curto, renderizado em uppercase 10px. */
  label: string
  /** Valor formatado (ex.: "R$ 12.480" ou "248"). */
  value: string
  /** Série já pronta para o sparkline. */
  sparkData: number[]
  /** Cor da linha/gradiente — resolvida a partir dos tokens --fp-*. */
  tone?: SparkTone
  /** Variação percentual; mostra um DeltaChip ao lado do rótulo. */
  delta?: number
  /** Quando false, queda vira "verde" no DeltaChip. */
  deltaPositiveIsGood?: boolean
  /** Ícone opcional à esquerda do rótulo. */
  icon?: LucideIcon
  /** Legenda discreta abaixo do valor (ex.: "vs. semana anterior"). */
  hint?: string
  className?: string
}

// ─── Helpers de cor ─────────────────────────────────────────────────────────

/** Resolve um token CSS (--fp-*) para a cor concreta — Canvas não aceita var(). */
function resolveColor(el: HTMLElement, tone: SparkTone): string {
  const { varName, fallback } = SPARK_TOKEN[tone]
  const v = getComputedStyle(el).getPropertyValue(varName).trim()
  return v || fallback
}

/** Aplica alpha a uma cor `#rrggbb`, `#rgb` ou `rgb(...)`. */
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
  if (c.startsWith('rgb(')) {
    return c.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
  }
  if (c.startsWith('rgba(')) return c
  return c
}

// ─── Desenho ────────────────────────────────────────────────────────────────

function drawSparkline(canvas: HTMLCanvasElement, data: number[], color: string): void {
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

  // Preenchimento com gradiente sob a curva
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

  // Linha
  ctx.beginPath()
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  // Ponto final
  ctx.beginPath()
  ctx.arc(last.x, last.y, 2, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function MetricCard({
  label,
  value,
  sparkData,
  tone = 'success',
  delta,
  deltaPositiveIsGood = true,
  icon: Icon,
  hint,
  className,
}: MetricCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const render = () => drawSparkline(canvas, sparkData, resolveColor(canvas, tone))
    render()

    const ro = new ResizeObserver(render)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [sparkData, tone])

  return (
    <div
      className={cn('flex flex-col gap-3 rounded-[10px] p-4', className)}
      style={{
        background: 'var(--fp-bg-card)',
        border: '1px solid var(--fp-border)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {Icon ? (
            <Icon
              size={13}
              strokeWidth={2}
              aria-hidden
              style={{ color: 'var(--fp-text-muted)' }}
            />
          ) : null}
          <span
            className="truncate text-[10px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: 'var(--fp-text-muted)' }}
          >
            {label}
          </span>
        </div>
        {typeof delta === 'number' ? (
          <DeltaChip value={delta} positiveIsGood={deltaPositiveIsGood} />
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className="truncate text-[24px] font-semibold leading-none tabular-nums"
            style={{ color: 'var(--fp-text-primary)' }}
          >
            {value}
          </div>
          {hint ? (
            <div className="mt-1.5 text-[11px]" style={{ color: 'var(--fp-text-muted)' }}>
              {hint}
            </div>
          ) : null}
        </div>

        <canvas
          ref={canvasRef}
          className="h-[40px] w-[96px] shrink-0"
          aria-hidden
        />
      </div>
    </div>
  )
}
