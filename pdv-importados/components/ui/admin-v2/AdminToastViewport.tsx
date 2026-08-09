'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useState } from 'react'
import { onGerenteToast, type GerenteToastKind } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'

type ToastItem = {
  id: number
  kind: GerenteToastKind
  message: string
}

const TOAST_KIND_CLASS: Record<GerenteToastKind, string> = {
  info: 'border-[var(--color-info-border)] bg-[var(--color-info-bg)] text-jl-fg-1',
  success: 'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-jl-fg-1',
  error: 'border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-jl-fg-1',
}

function createToastItem(kind: GerenteToastKind, message: string): ToastItem {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    kind,
    message,
  }
}

function removeToast(setItems: Dispatch<SetStateAction<ToastItem[]>>, id: number) {
  setItems((prev) => prev.filter((item) => item.id !== id))
}

function scheduleToastRemoval(setItems: Dispatch<SetStateAction<ToastItem[]>>, id: number) {
  window.setTimeout(() => removeToast(setItems, id), 3200)
}

/** Viewport de toast Admin V2 — mesmo bus `emitGerenteToast`, tokens DS. */
export function AdminToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    return onGerenteToast((payload) => {
      const item = createToastItem(payload.kind, payload.message)
      setItems((prev) => [...prev, item])
      scheduleToastRemoval(setItems, item.id)
    })
  }, [])

  if (items.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className="fixed right-3.5 top-3.5 z-[var(--z-toast,60)] grid max-w-[min(22rem,calc(100vw-1.75rem))] gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            'rounded-lg border px-3 py-2.5 text-small leading-snug shadow-[var(--shadow-elevated)] fp-focus-ring',
            TOAST_KIND_CLASS[item.kind],
          )}
        >
          {item.message}
        </div>
      ))}
    </div>
  )
}
