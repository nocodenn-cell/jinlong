"use client"

import { memo } from "react"
import { Banknote, CreditCard, QrCode, WalletCards, type LucideIcon } from "lucide-react"
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
// Ordem preservada igual ao array de atalhos 1-4 em CaixaPageClient (onSelecionarMetodo) —
// reordenar aqui sem sincronizar lá quebraria a correspondência tecla ↔ card.
const OPCOES: ReadonlyArray<{ id: MetodoPagamentoUi; labelKey: keyof Mensagens["caixa"]; icon: LucideIcon }> = [
  { id: "dinheiro", labelKey: "pdv_metodo_pagamento_dinheiro", icon: Banknote },
  { id: "pix", labelKey: "pdv_metodo_pagamento_pix", icon: QrCode },
  { id: "debito", labelKey: "pdv_metodo_pagamento_debito", icon: WalletCards },
  { id: "credito", labelKey: "pdv_metodo_pagamento_credito", icon: CreditCard },
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
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {m.caixa.pdv_metodo_pagamento_titulo}
      </span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPCOES.map((op, i) => {
          const selected = value === op.id
          // Obtém o texto da chave correta em m.caixa (como string)
          const label = m.caixa[op.labelKey] as string
          const atalho = i + 1
          const Icon = op.icon
          return (
            <RadioGroupItem
              key={op.id}
              value={op.id}
              aria-keyshortcuts={`${atalho}`}
              disabled={disabled}
              title={`${label} (tecla ${atalho})`}
              className={cn(
                // #32 hit-target de toque (tablet/touch): card maior, ícone em cima do rótulo.
                "relative flex min-h-[4.75rem] flex-col items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-center text-xs font-semibold leading-tight disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
                selected
                  ? "border-2 border-primary bg-primary/10 text-primary shadow-sm"
                  : "border border-border bg-muted/40 text-foreground hover:bg-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold tabular-nums",
                  selected ? "bg-primary/20 text-primary" : "bg-foreground/10 text-muted-foreground",
                )}
              >
                {atalho}
              </span>
              <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} aria-hidden />
              {label}
            </RadioGroupItem>
          )
        })}
      </div>
    </RadioGroup>
  )
}

export const CaixaPdvMetodoPagamentoSelector = memo(CaixaPdvMetodoPagamentoSelectorImpl)