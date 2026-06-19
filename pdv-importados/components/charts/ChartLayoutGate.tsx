'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Guard rail de layout (invariante como código).
 *
 * Um gráfico só pode renderizar quando o contêiner tem dimensões reais
 * (`width > 0 && height > 0`). Renderizar recharts/canvas em caixa de tamanho
 * zero gera warnings, layout quebrado e, em alguns motores, NaN em escalas.
 * Enquanto o box não estiver mensurado, mostramos um placeholder estável.
 */
export function isRenderableSize(width: number, height: number): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  )
}

type ChartLayoutGateProps = {
  children: ReactNode
  /** Placeholder enquanto o contêiner não tem dimensões válidas. */
  fallback?: ReactNode
  className?: string
}

const defaultFallback = (
  <div className="h-full w-full animate-pulse rounded-md bg-jl-surface-soft" aria-hidden />
)

export function ChartLayoutGate({ children, fallback, className }: ChartLayoutGateProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      const rect = el.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ready = isRenderableSize(size.width, size.height)

  return (
    <div ref={ref} className={className ?? 'h-full w-full'}>
      {ready ? children : (fallback ?? defaultFallback)}
    </div>
  )
}
