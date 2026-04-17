'use client'

import { useEffect, useState } from 'react'
import { onGerenteToast, type GerenteToastKind } from '@/lib/gerente/toast'

type ToastItem = {
  id: number
  kind: GerenteToastKind
  message: string
}

const TOAST_STYLE: Record<GerenteToastKind, { bg: string; border: string; color: string }> = {
  info: { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
  success: { bg: '#ecfdf5', border: '#86efac', color: '#166534' },
  error: { bg: '#fef2f2', border: '#fecaca', color: '#991b1b' },
}

/** Área fixa de feedback para hooks useGerenteQuery / useGerenteMutation. */
export function GerenteToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    return onGerenteToast((payload) => {
      const item: ToastItem = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        kind: payload.kind,
        message: payload.message,
      }
      setItems((prev) => [...prev, item])
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id))
      }, 2800)
    })
  }, [])

  if (items.length === 0) return null

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 14,
        right: 14,
        display: 'grid',
        gap: 8,
        zIndex: 60,
        maxWidth: 340,
      }}
    >
      {items.map((item) => {
        const style = TOAST_STYLE[item.kind]
        return (
          <div
            key={item.id}
            style={{
              border: `1px solid ${style.border}`,
              background: style.bg,
              color: style.color,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 13,
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            }}
          >
            {item.message}
          </div>
        )
      })}
    </div>
  )
}
