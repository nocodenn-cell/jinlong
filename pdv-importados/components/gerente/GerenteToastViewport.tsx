'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useState } from 'react'
import { onToast, type ToastKind } from '@/lib/gerente/toast'
import { cn } from '@/lib/utils'

type ToastItem = {
  id: number
  kind: ToastKind
  message: string
}

const TOAST_KIND_CLASS: Record<ToastKind, string> = {
  info: 'border-blue-200/90 bg-blue-50 text-blue-950',
  success: 'border-emerald-300/90 bg-emerald-50 text-emerald-950',
  error: 'border-red-200/90 bg-red-50 text-red-950',
}

function createToastItem(kind: ToastKind, message: string): ToastItem {
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

function renderToastItem(item: ToastItem) {
  return (
    <div
      key={item.id}
      className={cn(
        'rounded-[10px] border px-3 py-2.5 text-sm leading-snug shadow-lg backdrop-blur-sm',
        TOAST_KIND_CLASS[item.kind],
      )}
    >
      {item.message}
    </div>
  )
}

/** Área fixa de feedback para hooks useGerenteQuery / useGerenteMutation. */
export function GerenteToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    return onToast((payload) => {
      const item = createToastItem(payload.kind, payload.message)
      setItems((prev) => [...prev, item])
      scheduleToastRemoval(setItems, item.id)
    })
  }, [])

  if (items.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed right-3.5 top-3.5 z-[60] grid max-w-[min(22rem,calc(100vw-1.75rem))] gap-2"
    >
      {items.map(renderToastItem)}
    </div>
  )
}
