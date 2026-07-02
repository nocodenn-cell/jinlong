import { describe, expect, it, vi } from "vitest"
import { createCommandRuntime, type SendCommand } from "@/app/caixa/operator-view/CommandRuntime"
import { createSaleStateMachine } from "@/app/caixa/operator-view/SaleStateMachine"
import type { PDVViewState } from "@/app/caixa/operator-view/pdvViewState"

function buildSnapshot(overrides: Partial<PDVViewState> = {}): PDVViewState {
  return {
    saleState: overrides.saleState ?? "SALE_ACTIVE",
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("CommandRuntime — serialização e idempotência", () => {
  it("dois scans rápidos com payloads diferentes: ambos executam, na ordem de emissão (sem reorder)", async () => {
    const machine = createSaleStateMachine(buildSnapshot())
    const order: string[] = []
    const d1 = deferred<PDVViewState>()
    const d2 = deferred<PDVViewState>()
    const sendCommand: SendCommand = vi.fn((command, payload) => {
      const codigo = String(payload?.codigo)
      order.push(`start:${codigo}`)
      return codigo === "AAA" ? d1.promise : d2.promise
    })
    const runtime = createCommandRuntime(machine, sendCommand)

    const p1 = runtime.execute("CMD_ITEM_SCAN", { codigo: "AAA" })
    const p2 = runtime.execute("CMD_ITEM_SCAN", { codigo: "BBB" })
    await Promise.resolve()

    // scan 2 não pode ter chamado o backend ainda — scan 1 ainda não terminou
    expect(sendCommand).toHaveBeenCalledTimes(1)
    expect(order).toEqual(["start:AAA"])

    d1.resolve(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    await p1
    d2.resolve(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    await p2

    expect(sendCommand).toHaveBeenCalledTimes(2)
    expect(order).toEqual(["start:AAA", "start:BBB"])
  })

  it("clique duplo em finalizar (mesmo command+payload): backend só é chamado uma vez", async () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "PAYMENT_PENDING" }))
    const d = deferred<PDVViewState>()
    const sendCommand: SendCommand = vi.fn(() => d.promise)
    const runtime = createCommandRuntime(machine, sendCommand)

    const p1 = runtime.execute("CMD_SALE_FINALIZE")
    const p2 = runtime.execute("CMD_SALE_FINALIZE")
    await Promise.resolve()

    expect(sendCommand).toHaveBeenCalledTimes(1)

    d.resolve(buildSnapshot({ saleState: "COMPLETED" }))
    const [r1, r2] = await Promise.all([p1, p2])

    expect(r1).toBe(r2)
    expect(sendCommand).toHaveBeenCalledTimes(1)

    const rejected = runtime.getLog().filter((e) => e.type === "CommandRejected")
    expect(rejected.some((e) => "reason" in e && e.reason === "duplicate_in_flight")).toBe(true)
  })

  it("após a primeira finalização terminar, um novo clique dispara uma nova execução (dedupe só vale enquanto em voo)", async () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "PAYMENT_PENDING" }))
    const sendCommand: SendCommand = vi.fn(async () => buildSnapshot({ saleState: "COMPLETED" }))
    const runtime = createCommandRuntime(machine, sendCommand)

    await runtime.execute("CMD_SALE_FINALIZE")
    await runtime.execute("CMD_SALE_FINALIZE")

    expect(sendCommand).toHaveBeenCalledTimes(2)
  })

  it("perda de resposta do backend: execute rejeita, lastCommand vira error, e um novo comando pode ser tentado depois", async () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "PAYMENT_PENDING" }))
    let call = 0
    const sendCommand: SendCommand = vi.fn(async () => {
      call += 1
      if (call === 1) throw new Error("network_lost")
      return buildSnapshot({ saleState: "COMPLETED" })
    })
    const runtime = createCommandRuntime(machine, sendCommand)

    await expect(runtime.execute("CMD_SALE_FINALIZE")).rejects.toThrow("network_lost")
    expect(machine.getState().lastCommand?.status).toBe("error")

    const result = await runtime.execute("CMD_SALE_FINALIZE")
    expect(result.saleState).toBe("COMPLETED")
    expect(machine.getState().lastCommand?.status).toBe("success")
    expect(sendCommand).toHaveBeenCalledTimes(2)
  })

  it("reorder de respostas de rede não afeta a ordem de aplicação: a segunda chamada só começa após a primeira aplicar seu resultado", async () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    const applied: string[] = []
    const d1 = deferred<PDVViewState>()
    let secondCallStarted = false
    const sendCommand: SendCommand = vi.fn((command, payload) => {
      const codigo = String(payload?.codigo)
      if (codigo === "SLOW") return d1.promise
      secondCallStarted = true
      return Promise.resolve(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    })
    const runtime = createCommandRuntime(machine, sendCommand)

    const p1 = runtime.execute("CMD_ITEM_SCAN", { codigo: "SLOW" }).then((s) => {
      applied.push("SLOW")
      return s
    })
    const p2 = runtime.execute("CMD_ITEM_SCAN", { codigo: "FAST" }).then((s) => {
      applied.push("FAST")
      return s
    })

    // mesmo que "FAST" resolveria mais rápido na rede, ele nem foi chamado ainda
    expect(secondCallStarted).toBe(false)

    d1.resolve(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    await Promise.all([p1, p2])

    expect(applied).toEqual(["SLOW", "FAST"])
  })

  it("event log registra CommandIssued/CommandAccepted/StateTransition na ordem certa para um comando bem-sucedido", async () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "PAYMENT_PENDING" }))
    const sendCommand: SendCommand = vi.fn(async () => buildSnapshot({ saleState: "COMPLETED" }))
    const runtime = createCommandRuntime(machine, sendCommand)

    await runtime.execute("CMD_SALE_FINALIZE")

    const types = runtime.getLog().map((e) => e.type)
    expect(types).toEqual(["CommandIssued", "CommandAccepted", "StateTransition"])
  })
})
