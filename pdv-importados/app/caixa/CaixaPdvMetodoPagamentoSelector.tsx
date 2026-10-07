"use client"

import { memo } from "react"
import { Banknote, CreditCard, QrCode } from "lucide-react"
import type { LucideIcon } from "lucide-react"
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

/**
 * Ícone grande + rótulo curto. O operador reconhece a forma pelo DESENHO, não
 * pela leitura — é o que permite bater o olho e finalizar em segundos. Ordem
 * fixa (1..4) porque o atalho de teclado é posicional.
 */
const OPCOES: ReadonlyArray<{
  id: MetodoPagamentoUi
  labelKey: keyof Mensagens["caixa"]
  Icon: LucideIcon
}> = [
  { id: "dinheiro", labelKey: "pdv_metodo_pagamento_dinheiro", Icon: Banknote },
  { id: "pix", labelKey: "pdv_metodo_pagamento_pix", Icon: QrCode },
  { id: "credito", labelKey: "pdv_metodo_pagamento_credito", Icon: CreditCard },
  { id: "debito", labelKey: "pdv_metodo_pagamento_debito", Icon: CreditCard },
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
      // Sem título visível: quatro ícones de pagamento não precisam de um rótulo
      // dizendo que são formas de pagamento. O aria-label cobre leitor de tela.
      className="grid grid-cols-4 gap-1.5"
    >
      {OPCOES.map((op, i) => {
        const selected = value === op.id
        const label = m.caixa[op.labelKey] as string
        const atalho = i + 1
        const Icon = op.Icon
        return (
          <RadioGroupItem
            key={op.id}
            value={op.id}
            aria-keyshortcuts={`${atalho}`}
            disabled={disabled}
            title={`${label} (${atalho})`}
            className={cn(
              "relative flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-lg px-1 py-2",
              "text-xs font-semibold leading-none transition disabled:cursor-not-allowed disabled:opacity-50",
              selected
                ? "border-2 border-primary bg-primary/10 text-primary shadow-sm"
                : "border border-jl-border-1 bg-jl-surface-soft text-jl-fg-1 hover:bg-jl-surface-elev",
            )}
          >
            <Icon className="h-7 w-7" strokeWidth={selected ? 2.4 : 1.9} aria-hidden />
            <span className="text-center">
              <span className="tabular-nums text-caption font-bold opacity-70">[{atalho}]</span>{' '}
              {label}
            </span>
          </RadioGroupItem>
        )
      })}
    </RadioGroup>
  )
}

export const CaixaPdvMetodoPagamentoSelector = memo(CaixaPdvMetodoPagamentoSelectorImpl)
