"use client"

import { memo } from "react"
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

// Mapeamento usando as chaves corretas de m.caixa
const OPCOES: ReadonlyArray<{ id: MetodoPagamentoUi; labelKey: keyof Mensagens["caixa"] }> = [
  { id: "dinheiro", labelKey: "pdv_metodo_pagamento_dinheiro" },
  { id: "pix", labelKey: "pdv_metodo_pagamento_pix" },
  { id: "debito", labelKey: "pdv_metodo_pagamento_debito" },
  { id: "credito", labelKey: "pdv_metodo_pagamento_credito" },
]

function CaixaPdvMetodoPagamentoSelectorImpl({
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
          classic ? "text-jl-fg-2" : "text-foreground/80",
        )}
      >
        {m.caixa.pdv_metodo_pagamento_titulo}
      </span>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {OPCOES.map((op) => {
          const selected = value === op.id
          // Obtém o texto da chave correta em m.caixa (como string)
          const label = m.caixa[op.labelKey] as string
          return (
            <button
              key={op.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              title={label}
              className={cn(
                // #32 hit-target de toque (tablet/touch): 44px (antes 36px) p/ os
                // botões mais tocados do PDV — PIX/Cartão/Dinheiro/Débito.
                "min-h-11 rounded-md px-2 py-1.5 text-center text-xs font-semibold leading-tight disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
                classic
                  ? selected
                    ? "border border-primary bg-primary/10 text-primary shadow-sm"
                    : "border border-jl-border-1 bg-jl-surface-soft text-jl-fg-1 hover:bg-jl-surface-elev"
                  : selected
                    ? "app-btn-accent"
                    : "border border-jl-border-1 bg-jl-surface-soft text-jl-fg-1 transition-colors hover:border-amber-400/70 hover:bg-amber-400/10 hover:text-jl-fg-1",
              )}
              onClick={() => onChange(op.id)}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const CaixaPdvMetodoPagamentoSelector = memo(CaixaPdvMetodoPagamentoSelectorImpl)