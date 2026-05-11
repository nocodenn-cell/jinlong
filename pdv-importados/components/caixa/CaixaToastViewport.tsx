"use client"

import type { CaixaToastKind } from "@/app/caixa/hooks/useCaixaMensagens"

type CaixaToastItem = {
  id: number
  kind: CaixaToastKind
  text: string
}

type Props = {
  items: CaixaToastItem[]
  onDismiss: (id: number) => void
}

const kindClass: Record<CaixaToastKind, string> = {
  info:
    'border border-primary/40 bg-card/95 text-foreground shadow-lg backdrop-blur-sm',
  success:
    'border border-success/45 bg-card/95 text-success shadow-lg backdrop-blur-sm',
  warning:
    'border border-amber-500/45 bg-card/95 text-amber-800 dark:text-amber-100 shadow-lg backdrop-blur-sm',
  error:
    'border border-destructive/45 bg-card/95 text-destructive shadow-lg backdrop-blur-sm',
}

export function CaixaToastViewport({ items, onDismiss }: Props) {
  if (items.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[70] grid max-w-[22rem] gap-2"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onDismiss(item.id)}
          className={`pointer-events-auto rounded-md border px-3 py-2 text-left text-sm shadow-lg transition-opacity hover:opacity-90 ${kindClass[item.kind]}`}
        >
          {item.text}
        </button>
      ))}
    </div>
  )
}
