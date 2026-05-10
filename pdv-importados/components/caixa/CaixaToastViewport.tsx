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
  info: "border-sky-500/45 bg-sky-950/85 text-sky-100",
  success: "border-emerald-500/45 bg-emerald-950/85 text-emerald-100",
  warning: "border-amber-500/45 bg-amber-950/90 text-amber-100",
  error: "border-red-500/45 bg-red-950/90 text-red-100",
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
