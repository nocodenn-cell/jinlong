'use client'

import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'
import { formatBRL } from '@/lib/format/money'
import { getChartJsTheme, createSuccessGradient } from '@/lib/tokens/chartJsThemes'

interface DashboardChartProps {
  /** ["00h", "01h", …, "23h"] */
  labels: string[]
  /** Valor por hora em REAIS. */
  data: number[]
  /** Hora de pico, ex.: "14h". */
  peakHour: string
  /** Valor do pico já formatado, ex.: "R$ 890,00". */
  peakValue: string
  titleLabel: string
  subtitleLabel: string
  peakLabel: string
}

function compactBRL(reais: number): string {
  if (reais >= 1000) {
    const k = reais / 1000
    return `R$${k.toFixed(k >= 10 ? 0 : 1).replace('.0', '')}k`
  }
  return `R$${reais.toFixed(0)}`
}

export function DashboardChart({ labels, data, peakHour, peakValue, titleLabel, subtitleLabel, peakLabel }: DashboardChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (chartRef.current) chartRef.current.destroy()

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const theme = getChartJsTheme()
    const gradient = createSuccessGradient(ctx)

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data,
            fill: true,
            backgroundColor: gradient,
            borderColor: theme.lineSuccess,
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: theme.pointSuccess,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBg,
            borderColor: theme.tooltipBorder,
            borderWidth: 1,
            titleColor: theme.tooltipTitleColor,
            bodyColor: theme.tooltipBodyColor,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (item) => {
                const val = item.parsed.y ?? 0
                return val > 0 ? formatBRL(val) : ''
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: theme.tickColor,
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: false,
              callback: (_value, index) =>
                [0, 6, 12, 18, 23].includes(index) ? labels[index] ?? '' : '',
            },
          },
          y: {
            grid: { color: theme.gridColor, drawTicks: false },
            border: { display: false },
            beginAtZero: true,
            ticks: {
              color: theme.tickColor,
              font: { size: 10 },
              callback: (value) => {
                const n = Number(value)
                return n > 0 ? compactBRL(n) : ''
              },
            },
          },
        },
      },
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [labels, data])

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border-secondary)]">
      <div className="flex items-start justify-between px-5 py-4">
        <div>
          <p className="text-[13px] font-medium text-jl-fg-1">{titleLabel}</p>
          <p className="mt-0.5 text-[11px] text-jl-fg-3">{subtitleLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-jl-fg-3">{peakLabel}</p>
          <p className="text-[13px] font-medium text-jl-fg-1">
            {peakValue} às {peakHour}
          </p>
        </div>
      </div>
      <div className="px-4 pb-4" style={{ height: 160 }}>
        <canvas ref={canvasRef} aria-label={titleLabel} />
      </div>
    </div>
  )
}
