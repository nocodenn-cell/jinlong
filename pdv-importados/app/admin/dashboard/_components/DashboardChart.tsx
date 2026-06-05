'use client'

/**
 * FastProduct Admin — DashboardChart (Fase 3)
 *
 * Gráfico de faturamento por hora — Chart.js client-only.
 *
 * ATENÇÃO: os valores chegam em REAIS (não centavos). A query do dashboard
 * agrega `vendas.total_liquido`, que já está em reais — por isso os
 * formatters NÃO dividem por 100 (diferente do mock original do design).
 */

import { useEffect, useRef } from 'react'
import Chart from 'chart.js/auto'

interface DashboardChartProps {
  /** ["00h", "01h", …, "23h"] */
  labels: string[]
  /** Valor por hora em REAIS. */
  data: number[]
  /** Hora de pico, ex.: "14h". */
  peakHour: string
  /** Valor do pico já formatado, ex.: "R$ 890,00". */
  peakValue: string
}

function compactBRL(reais: number): string {
  if (reais >= 1000) {
    const k = reais / 1000
    return `R$${k.toFixed(k >= 10 ? 0 : 1).replace('.0', '')}k`
  }
  return `R$${reais.toFixed(0)}`
}

export function DashboardChart({ labels, data, peakHour, peakValue }: DashboardChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Destrói instância anterior (hot-reload safe).
    if (chartRef.current) chartRef.current.destroy()

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const gradient = ctx.createLinearGradient(0, 0, 0, 140)
    gradient.addColorStop(0, 'rgba(34,197,94,0.18)')
    gradient.addColorStop(1, 'rgba(34,197,94,0)')

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data,
            fill: true,
            backgroundColor: gradient,
            borderColor: '#22c55e',
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#22c55e',
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
            backgroundColor: '#18181b',
            borderColor: '#3f3f46',
            borderWidth: 1,
            titleColor: '#a1a1aa',
            bodyColor: '#f5f5f5',
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label: (item) => {
                const val = item.parsed.y ?? 0
                return val > 0
                  ? 'R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                  : ''
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: '#52525b',
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: false,
              callback: (_value, index) =>
                [0, 6, 12, 18, 23].includes(index) ? labels[index] ?? '' : '',
            },
          },
          y: {
            grid: { color: 'rgba(63,63,70,0.4)', drawTicks: false },
            border: { display: false },
            beginAtZero: true,
            ticks: {
              color: '#52525b',
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
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4">
        <div>
          <p className="text-[13px] font-medium text-zinc-100">Faturamento por hora</p>
          <p className="mt-0.5 text-[11px] text-zinc-600">Total líquido acumulado no período</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-zinc-600">Pico na hora</p>
          <p className="text-[13px] font-medium text-zinc-100">
            {peakValue} às {peakHour}
          </p>
        </div>
      </div>
      {/* Canvas */}
      <div className="px-4 pb-4" style={{ height: 160 }}>
        <canvas ref={canvasRef} aria-label="Gráfico de faturamento por hora" />
      </div>
    </div>
  )
}
