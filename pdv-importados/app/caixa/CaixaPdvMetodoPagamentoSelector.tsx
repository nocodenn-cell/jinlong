"use client"

import { memo } from "react"
import type { Mensagens } from "@/i18n/getMessages"
import type { MetodoPagamentoUi } from "@/app/caixa/caixaMetodoPagamento"
import { cn } from "@/lib/utils"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

type Props = Readonly<{
  m: Mensagens
  value: MetodoPagamentoUi
  onChange: (value: MetodoPagamentoUi) => void
  disabled?: boolean
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
}: Props) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as MetodoPagamentoUi)}
      aria-label={m.caixa.pdv_metodo_pagamento_aria}
      className="flex flex-col gap-1.5"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-jl-fg-2">
        {m.caixa.pdv_metodo_pagamento_titulo}
      </span>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {OPCOES.map((op, i) => {
          const selected = value === op.id
          // Obtém o texto da chave correta em m.caixa (como string)
          const label = m.caixa[op.labelKey] as string
          const atalho = i + 1
          return (
            <RadioGroupItem
              key={op.id}
              value={op.id}
              aria-keyshortcuts={`${atalho}`}
              disabled={disabled}
              title={`${label} (tecla ${atalho})`}
              className={cn(
                // #32 hit-target de toque (tablet/touch): 44px (antes 36px) p/ os
                // botões mais tocados do PDV — PIX/Cartão/Dinheiro/Débito.
                "relative min-h-11 rounded-md px-2 py-1.5 text-center text-xs font-semibold leading-tight disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
                selected
                  ? "border border-primary bg-primary/10 text-primary shadow-sm"
                  : "border border-jl-border-1 bg-jl-surface-soft text-jl-fg-1 hover:bg-jl-surface-elev",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold tabular-nums",
                  selected ? "bg-black/15 text-current" : "bg-black/10 text-jl-fg-3",
                )}
              >
                {atalho}
              </span>
              {label}
            </RadioGroupItem>
          )
        })}
      </div>
    </RadioGroup>
  )
}

export const CaixaPdvMetodoPagamentoSelector = memo(CaixaPdvMetodoPagamentoSelectorImpl)