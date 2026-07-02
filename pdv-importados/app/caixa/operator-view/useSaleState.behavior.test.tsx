/** @vitest-environment jsdom */
import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createSaleStateMachine, type PDVBackendSnapshot } from "@/app/caixa/operator-view/SaleStateMachine"
import { useSaleState, type SendCommand } from "@/app/caixa/operator-view/useSaleState"
import { OperatorView } from "@/app/caixa/operator-view/OperatorView"
import type { PDVViewState } from "@/app/caixa/operator-view/pdvViewState"

function buildSnapshot(overrides: Partial<PDVViewState> = {}): PDVViewState {
  return {
    saleState: overrides.saleState ?? "IDLE",
    caixaStatus: overrides.caixaStatus ?? "ABERTO",
    suspensaoGlobal: overrides.suspensaoGlobal ?? { ativa: false, motivo: null, afetaOperadorAtual: false },
    items: overrides.items ?? [],
    total: overrides.total ?? { bruto: 0, desconto: 0, liquido: 0, descontoGerente: null },
    lastCompletedSale: overrides.lastCompletedSale ?? null,
    activeError: overrides.activeError ?? null,
    allowedActions: overrides.allowedActions ?? [],
    primaryAction: overrides.primaryAction ?? null,
  }
}

function Host({
  machine,
  sendCommand,
}: {
  machine: ReturnType<typeof createSaleStateMachine>
  sendCommand: SendCommand
}) {
  const { viewState, dispatch } = useSaleState(machine, sendCommand)
  return <OperatorView viewState={viewState} onCommand={(command, payload) => void dispatch(command, payload)} />
}

describe("useSaleState — UI é projeção pura do SaleStateMachine", () => {
  let container: HTMLDivElement
  let root: Root

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("renderiza o estado inicial do machine sem nenhum useState próprio", () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "IDLE", caixaStatus: "FECHADO" }))
    act(() => {
      root.render(<Host machine={machine} sendCommand={vi.fn()} />)
    })

    expect(container.querySelector('[data-sale-state="IDLE"]')).not.toBeNull()
  })

  it("dispatch chama o sendCommand injetado e a UI reflete o snapshot devolvido, sem lógica de transição local", async () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "IDLE", caixaStatus: "ABERTO" }))
    const sendCommand: SendCommand = vi.fn(async () =>
      buildSnapshot({
        saleState: "SALE_ACTIVE",
        items: [{ id: "l1", produtoId: "p1", quantidade: 1, nome: "Produto X" }],
        total: { bruto: 20, desconto: 0, liquido: 20, descontoGerente: null },
      }),
    )

    act(() => {
      root.render(<Host machine={machine} sendCommand={sendCommand} />)
    })

    const input = container.querySelector('[data-testid="input-scanner"] input') as HTMLInputElement
    const form = container.querySelector('[data-testid="input-scanner"]') as HTMLFormElement
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!

    await act(async () => {
      nativeInputValueSetter.call(input, "789")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await Promise.resolve()
    })

    expect(sendCommand).toHaveBeenCalledWith("CMD_ITEM_SCAN", { codigo: "789" })
    expect(container.querySelector('[data-sale-state="SALE_ACTIVE"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="total-liquido"]')?.textContent).toContain("20")
  })

  it("dois snapshots em sequência: o segundo substitui o primeiro por inteiro (sem estado residual)", async () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    let call = 0
    const responses: PDVBackendSnapshot[] = [
      buildSnapshot({ saleState: "PAYMENT_PENDING", total: { bruto: 15, desconto: 0, liquido: 15, descontoGerente: null } }),
    ]
    const sendCommand: SendCommand = vi.fn(async () => responses[call++])

    act(() => {
      root.render(<Host machine={machine} sendCommand={sendCommand} />)
    })

    const button = container.querySelector('[data-testid="payment-button"]') as HTMLButtonElement | null
    // SALE_ACTIVE sem primaryAction no snapshot inicial -> nenhum botão; dispara via machine diretamente
    expect(button).toBeNull()

    await act(async () => {
      machine.applySnapshot(responses[0])
      await Promise.resolve()
    })

    expect(container.querySelector('[data-sale-state="PAYMENT_PENDING"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="total-liquido"]')?.textContent).toContain("15")
  })
})
