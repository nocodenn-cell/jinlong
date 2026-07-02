/** @vitest-environment jsdom */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { flushSync } from "react-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OperatorView } from "@/app/caixa/operator-view/OperatorView"
import type { ItemCarrinho } from "@shared-core/src/stores/unifiedCartStore"
import type { PDVAction, PDVViewState } from "@/app/caixa/operator-view/pdvViewState"

function buildItem(overrides: Partial<ItemCarrinho> = {}): ItemCarrinho {
  return {
    id: overrides.id ?? "linha-1",
    produtoId: overrides.produtoId ?? "11111111-1111-1111-1111-111111111111",
    quantidade: overrides.quantidade ?? 1,
    nome: overrides.nome ?? "Produto teste",
  }
}

function buildAction(overrides: Partial<PDVAction> = {}): PDVAction {
  return {
    command: overrides.command ?? "CMD_SALE_CHECKOUT_START",
    label: overrides.label ?? "Continuar",
    enabled: overrides.enabled ?? true,
    requiresConfirmation: overrides.requiresConfirmation ?? false,
  }
}

function buildViewState(overrides: Partial<PDVViewState> = {}): PDVViewState {
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

function render(root: Root, viewState: PDVViewState, onCommand: (command: string, payload?: unknown) => void) {
  flushSync(() => {
    root.render(<OperatorView viewState={viewState} onCommand={onCommand} />)
  })
}

describe("OperatorView — renderização 1:1 com PDVViewState por saleState", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    flushSync(() => {
      root.unmount()
    })
    container.remove()
  })

  it("IDLE com caixa FECHADO: só PaymentButton (abrir caixa), sem scanner/lista/totais", () => {
    const viewState = buildViewState({
      saleState: "IDLE",
      caixaStatus: "FECHADO",
      primaryAction: buildAction({ command: "CMD_CAIXA_ABRIR", label: "Abrir caixa" }),
    })
    render(root, viewState, vi.fn())

    expect(container.querySelector('[data-testid="input-scanner"]')).toBeNull()
    expect(container.querySelector('[data-testid="sale-list"]')).toBeNull()
    expect(container.querySelector('[data-testid="total-panel"]')).toBeNull()
    const btn = container.querySelector('[data-testid="payment-button"]') as HTMLButtonElement
    expect(btn.textContent).toBe("Abrir caixa")
  })

  it("IDLE com caixa ABERTO: InputScanner habilitado + PaymentButton desabilitado, sem carrinho", () => {
    const viewState = buildViewState({ saleState: "IDLE", caixaStatus: "ABERTO", primaryAction: null })
    render(root, viewState, vi.fn())

    const input = container.querySelector('[data-testid="input-scanner"] input') as HTMLInputElement
    expect(input.disabled).toBe(false)
    expect(container.querySelector('[data-testid="sale-list"]')).toBeNull()
    expect(container.querySelector('[data-testid="payment-button"]')).toBeNull()
  })

  it("SALE_ACTIVE: todos os 4 componentes, SaleList editável", () => {
    const item = buildItem()
    const viewState = buildViewState({
      saleState: "SALE_ACTIVE",
      items: [item],
      total: { bruto: 10, desconto: 0, liquido: 10, descontoGerente: null },
      primaryAction: buildAction({ command: "CMD_SALE_CHECKOUT_START", label: "Ir para pagamento" }),
    })
    render(root, viewState, vi.fn())

    expect(container.querySelector('[data-testid="input-scanner"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="sale-list"]')).not.toBeNull()
    expect(container.querySelector(`[aria-label="Remover ${item.nome}"]`)).not.toBeNull()
    expect(container.querySelector('[data-testid="total-panel"]')).not.toBeNull()
    expect((container.querySelector('[data-testid="payment-button"]') as HTMLButtonElement).textContent).toBe(
      "Ir para pagamento",
    )
  })

  it("PAYMENT_PENDING: SaleList somente-leitura (sem botão remover) + TotalPanel + PaymentButton, sem scanner", () => {
    const item = buildItem()
    const viewState = buildViewState({
      saleState: "PAYMENT_PENDING",
      items: [item],
      total: { bruto: 10, desconto: 0, liquido: 10, descontoGerente: null },
      primaryAction: buildAction({ command: "CMD_SALE_FINALIZE", label: "Finalizar" }),
    })
    render(root, viewState, vi.fn())

    expect(container.querySelector('[data-testid="input-scanner"]')).toBeNull()
    expect(container.querySelector('[data-testid="sale-list"]')).not.toBeNull()
    expect(container.querySelector(`[aria-label="Remover ${item.nome}"]`)).toBeNull()
    expect(container.querySelector('[data-testid="total-panel"]')).not.toBeNull()
  })

  it("PAYMENT_PENDING bloqueado por suspensão global: sem botão, mensagem de erro visível", () => {
    const viewState = buildViewState({
      saleState: "PAYMENT_PENDING",
      items: [buildItem()],
      total: { bruto: 10, desconto: 0, liquido: 10, descontoGerente: null },
      primaryAction: null,
      activeError: { code: "FINALIZAR_VENDA_VENDAS_SUSPENSAS", classe: "bloqueante", mensagem: "Vendas suspensas pelo gerente." },
    })
    render(root, viewState, vi.fn())

    expect(container.querySelector('[data-testid="payment-button"]')).toBeNull()
    expect(container.querySelector('[data-testid="payment-button-blocked"]')?.textContent).toBe(
      "Vendas suspensas pelo gerente.",
    )
  })

  it("PAYMENT_PROCESSING: tela bloqueante dedicada, nenhum dos 4 componentes normais", () => {
    const viewState = buildViewState({
      saleState: "PAYMENT_PROCESSING",
      items: [buildItem()],
      total: { bruto: 10, desconto: 0, liquido: 10, descontoGerente: null },
      primaryAction: null,
    })
    render(root, viewState, vi.fn())

    expect(container.querySelector('[data-testid="operator-view-processing"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="input-scanner"]')).toBeNull()
    expect(container.querySelector('[data-testid="sale-list"]')).toBeNull()
    expect(container.querySelector('[data-testid="total-panel"]')).toBeNull()
    expect(container.querySelector('[data-testid="payment-button"]')).toBeNull()
  })

  it("COMPLETED: TotalPanel do resumo final + PaymentButton (nova venda), sem scanner/lista", () => {
    const viewState = buildViewState({
      saleState: "COMPLETED",
      total: { bruto: 10, desconto: 0, liquido: 10, descontoGerente: null },
      primaryAction: buildAction({ command: "CMD_SALE_NEW", label: "Nova venda" }),
    })
    render(root, viewState, vi.fn())

    expect(container.querySelector('[data-testid="input-scanner"]')).toBeNull()
    expect(container.querySelector('[data-testid="sale-list"]')).toBeNull()
    expect(container.querySelector('[data-testid="total-panel"]')).not.toBeNull()
    expect((container.querySelector('[data-testid="payment-button"]') as HTMLButtonElement).textContent).toBe(
      "Nova venda",
    )
  })

  it("InputScanner emite CMD_ITEM_SCAN direto ao submeter, sem lógica intermediária", () => {
    const onCommand = vi.fn()
    const viewState = buildViewState({ saleState: "SALE_ACTIVE" })
    render(root, viewState, onCommand)

    const input = container.querySelector('[data-testid="input-scanner"] input') as HTMLInputElement
    const form = container.querySelector('[data-testid="input-scanner"]') as HTMLFormElement
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!

    flushSync(() => {
      nativeInputValueSetter.call(input, "7891234567890")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    flushSync(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })

    expect(onCommand).toHaveBeenCalledWith("CMD_ITEM_SCAN", { codigo: "7891234567890" })
  })

  it("PaymentButton desabilitado não dispara onCommand ao clicar", () => {
    const onCommand = vi.fn()
    const viewState = buildViewState({
      saleState: "SALE_ACTIVE",
      primaryAction: buildAction({ enabled: false }),
    })
    render(root, viewState, onCommand)

    const btn = container.querySelector('[data-testid="payment-button"]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)

    flushSync(() => {
      btn.click()
    })
    expect(onCommand).not.toHaveBeenCalled()
  })
})
