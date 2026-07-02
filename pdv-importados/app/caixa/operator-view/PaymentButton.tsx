"use client"

import { memo } from "react"
import type { PDVAction, PDVViewState } from "./pdvViewState"

type Props = Readonly<{
  primaryAction: PDVAction | null
  activeError: PDVViewState["activeError"]
  onCommand: (command: string) => void
}>

function PaymentButtonImpl({ primaryAction, activeError, onCommand }: Props) {
  if (!primaryAction) {
    if (activeError) {
      return (
        <p data-testid="payment-button-blocked" role="alert" className="text-sm">
          {activeError.mensagem}
        </p>
      )
    }
    return null
  }

  return (
    <button
      type="button"
      data-testid="payment-button"
      disabled={!primaryAction.enabled}
      onClick={() => onCommand(primaryAction.command)}
      className="w-full rounded px-4 py-3 font-semibold disabled:opacity-50"
    >
      {primaryAction.label}
    </button>
  )
}

export const PaymentButton = memo(PaymentButtonImpl)
