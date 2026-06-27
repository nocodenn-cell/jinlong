"use client"

import type { Mensagens } from "@/i18n/getMessages"
import { cn } from "@/lib/utils"

type Props = {
  m: Mensagens
  className?: string
}

export function CaixaKeyboardHintsBar({ m, className }: Props) {
  const hints = [
    { key: "Enter", label: m.caixa.hotkey_adicionar ?? "Adicionar" },
    { key: "Esc", label: m.caixa.hotkey_limpar ?? "Limpar" },
    { key: "F1", label: m.caixa.hotkey_cliente ?? "Cliente" },
    { key: "F2", label: m.caixa.hotkey_pagamento ?? "Pagamento" },
  ]

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-xs text-fg-secondary px-2 py-1",
        className,
      )}
    >
      {hints.map((hint) => (
        <span key={hint.key} className="inline-flex items-center gap-1">
          <kbd className="inline-flex items-center justify-center rounded border border-current px-1.5 py-0.5 min-w-6 font-mono text-[11px] font-medium">
            {hint.key}
          </kbd>
          <span>{hint.label}</span>
        </span>
      ))}
    </div>
  )
}
