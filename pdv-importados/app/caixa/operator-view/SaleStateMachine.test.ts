import { describe, expect, it, vi } from "vitest"
import { createSaleStateMachine, interpretBackendSnapshot } from "@/app/caixa/operator-view/SaleStateMachine"
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

describe("interpretBackendSnapshot", () => {
  it("aceita um saleState válido e devolve um objeto congelado", () => {
    const result = interpretBackendSnapshot(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    expect(result.saleState).toBe("SALE_ACTIVE")
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.items)).toBe(true)
    expect(Object.isFrozen(result.allowedActions)).toBe(true)
  })

  it("rejeita saleState fora do enum — não inventa um estado válido a partir de um valor desconhecido", () => {
    const invalido = buildSnapshot({ saleState: "SALE_ACTIVE" })
    // @ts-expect-error — simula payload de backend malformado
    invalido.saleState = "SALE_SUSPENDED"
    expect(() => interpretBackendSnapshot(invalido)).toThrow(/saleState desconhecido/)
  })

  it("não recalcula nem deriva nenhum campo — devolve os mesmos valores recebidos", () => {
    const snapshot = buildSnapshot({
      saleState: "SALE_ACTIVE",
      total: { bruto: 99.9, desconto: 5, liquido: 94.9, descontoGerente: null },
    })
    const result = interpretBackendSnapshot(snapshot)
    expect(result.total).toEqual(snapshot.total)
  })
})

describe("createSaleStateMachine", () => {
  it("getState devolve o snapshot inicial interpretado", () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "IDLE" }))
    expect(machine.getState().saleState).toBe("IDLE")
  })

  it("applySnapshot substitui o estado inteiro, nunca faz merge parcial", () => {
    const machine = createSaleStateMachine(
      buildSnapshot({
        saleState: "SALE_ACTIVE",
        total: { bruto: 10, desconto: 0, liquido: 10, descontoGerente: null },
      }),
    )

    machine.applySnapshot(buildSnapshot({ saleState: "PAYMENT_PENDING" }))

    const state = machine.getState()
    expect(state.saleState).toBe("PAYMENT_PENDING")
    // o snapshot novo não trouxe total customizado — o total antigo NÃO sobrevive (sem merge)
    expect(state.total).toEqual({ bruto: 0, desconto: 0, liquido: 0, descontoGerente: null })
  })

  it("notifica todos os listeners inscritos a cada applySnapshot", () => {
    const machine = createSaleStateMachine(buildSnapshot())
    const listenerA = vi.fn()
    const listenerB = vi.fn()
    machine.subscribe(listenerA)
    machine.subscribe(listenerB)

    machine.applySnapshot(buildSnapshot({ saleState: "SALE_ACTIVE" }))

    expect(listenerA).toHaveBeenCalledTimes(1)
    expect(listenerB).toHaveBeenCalledTimes(1)
  })

  it("subscribe devolve uma função que cancela a inscrição", () => {
    const machine = createSaleStateMachine(buildSnapshot())
    const listener = vi.fn()
    const unsubscribe = machine.subscribe(listener)
    unsubscribe()

    machine.applySnapshot(buildSnapshot({ saleState: "SALE_ACTIVE" }))

    expect(listener).not.toHaveBeenCalled()
  })
})
