"use client"

import { memo } from "react"
import type { PDVViewState } from "./pdvViewState"
import { InputScanner } from "./InputScanner"
import { SaleList } from "./SaleList"
import { TotalPanel } from "./TotalPanel"
import { PaymentButton } from "./PaymentButton"

type Props = Readonly<{
  viewState: PDVViewState
  onCommand: (command: string, payload?: Record<string, unknown>) => void
}>

/**
 * Tela única do PDV. Renderização 1:1 com PDVViewState — nenhuma lógica de
 * fluxo além do mapeamento saleState → slots definido em
 * docs/PDV_FASE2_FRONTEND_SHELL_SPEC.md §3. Nenhum useState de negócio aqui.
 */
function OperatorViewImpl({ viewState, onCommand }: Props) {
  const { saleState, caixaStatus, items, total, primaryAction, activeError } = viewState

  if (saleState === "PAYMENT_PROCESSING") {
    return (
      <div data-testid="operator-view-processing" role="status" aria-live="polite" className="py-16 text-center">
        Processando pagamento…
      </div>
    )
  }

  const inputScannerEnabled =
    (saleState === "IDLE" || saleState === "SALE_ACTIVE") && caixaStatus === "ABERTO"
  const showInputScanner = saleState === "SALE_ACTIVE" || (saleState === "IDLE" && caixaStatus === "ABERTO")
  const showSaleList = saleState === "SALE_ACTIVE" || saleState === "PAYMENT_PENDING"
  const showTotalPanel = saleState === "SALE_ACTIVE" || saleState === "PAYMENT_PENDING" || saleState === "COMPLETED"
  const saleListEditable = saleState === "SALE_ACTIVE"

  return (
    <div data-testid="operator-view" data-sale-state={saleState} className="flex flex-col gap-4">
      {showInputScanner ? (
        <InputScanner
          enabled={inputScannerEnabled}
          onCommand={(command, payload) => onCommand(command, payload)}
        />
      ) : null}

      {showSaleList ? (
        <SaleList
          items={items}
          editable={saleListEditable}
          onCommand={(command, payload) => onCommand(command, payload)}
        />
      ) : null}

      {showTotalPanel ? <TotalPanel total={total} /> : null}

      <PaymentButton primaryAction={primaryAction} activeError={activeError} onCommand={onCommand} />
    </div>
  )
}

export const OperatorView = memo(OperatorViewImpl)
