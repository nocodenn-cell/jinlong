"use client"

import type { Mensagens } from "@/i18n/getMessages"
import type { MetodoPagamentoUi } from "@/app/caixa/caixaMetodoPagamento"
import { cn } from "@/lib/utils"

type Props = Readonly<{
  m: Mensagens
  value: MetodoPagamentoUi
  onChange: (value: MetodoPagamentoUi) => void
  disabled?: boolean
  variant?: "default" | "classic"
}>

const OPCOES: ReadonlyArray<{ id: MetodoPagamentoUi; labelKey: keyof Mensagens["gerente"] }> = [
  { id: "dinheiro", labelKey: "pagamento_dinheiro" },
  { id: "pix", labelKey: "pagamento_pix" },
  { id: "debito", labelKey: "forma_cartao_debito" },
  { id: "credito", labelKey: "forma_cartao_credito" },
]

export function CaixaPdvMetodoPagamentoSelector({
  m,
  value,
  onChange,
  disabled = false,
  variant = "default",
}: Props) {
  const classic = variant === "classic"

  return (
    <div
      role="radiogroup"
      aria-label={m.caixa.pdv_metodo_pagamento_aria}
      className="flex flex-col gap-1.5"
    >
      <span
        className={cn(
          "text-xs font-semibold uppercase tracking-wide",
          classic ? "text-blue-100/85" : "text-foreground/80",
        )}
      >
        {m.caixa.pdv_metodo_pagamento_titulo}
      </span>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {OPCOES.map((op) => {
          const selected = value === op.id
          return (
            <button
              key={op.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              title={m.gerente[op.labelKey]}
              className={cn(
                "min-h-9 rounded-md px-2 py-1.5 text-center text-xs font-semibold leading-tight disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
                classic
                  ? selected
                    ? "border border-white/50 bg-white text-blue-900 shadow-sm"
                    : "border border-white/30 bg-white/10 text-white hover:bg-white/20"
                  : selected
                    ? "app-btn-accent"
                    : "app-btn-neutral",
              )}
              onClick={() => onChange(op.id)}
            >
              {m.gerente[op.labelKey]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
