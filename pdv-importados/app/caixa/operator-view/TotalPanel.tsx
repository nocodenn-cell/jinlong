"use client"

import { memo } from "react"
import type { PDVViewState } from "./pdvViewState"

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

type Props = Readonly<{
  total: PDVViewState["total"]
}>

function TotalPanelImpl({ total }: Props) {
  return (
    <dl data-testid="total-panel" className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <dt className="opacity-60">Bruto</dt>
      <dd data-testid="total-bruto" className="text-right">{currency.format(total.bruto)}</dd>

      <dt className="opacity-60">Desconto</dt>
      <dd data-testid="total-desconto" className="text-right">{currency.format(total.desconto)}</dd>

      <dt className="font-semibold">Total</dt>
      <dd data-testid="total-liquido" className="text-right text-lg font-semibold">
        {currency.format(total.liquido)}
      </dd>
    </dl>
  )
}

export const TotalPanel = memo(TotalPanelImpl)
