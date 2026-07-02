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

describe("CommandRuntime — correções da auditoria crítica", () => {
  it("[achado #1] dois scans idênticos consecutivos (mesmo código de barras): ambos executam, nenhuma unidade é descartada", async () => {
    const machine = createSaleStateMachine(buildSnapshot())
    const sendCommand: SendCommand = vi.fn(async () => buildSnapshot({ saleState: "SALE_ACTIVE" }))
    const runtime = createCommandRuntime(machine, sendCommand)

    const [r1, r2] = await Promise.all([
      runtime.execute("CMD_ITEM_SCAN", { codigo: "7891234567890" }),
      runtime.execute("CMD_ITEM_SCAN", { codigo: "7891234567890" }),
    ])

    expect(sendCommand).toHaveBeenCalledTimes(2)
    expect(r1).not.toBe(r2)
    const rejected = runtime.getLog().filter((e) => e.type === "CommandRejected")
    expect(rejected).toHaveLength(0)
  })

  it("[achado #1] CMD_SALE_FINALIZE continua deduplicado por natureza (comando idempotente) mesmo com o novo comportamento padrão", async () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "PAYMENT_PENDING" }))
    const d = deferred<PDVViewState>()
    const sendCommand: SendCommand = vi.fn(() => d.promise)
    const runtime = createCommandRuntime(machine, sendCommand)

    const p1 = runtime.execute("CMD_SALE_FINALIZE")
    const p2 = runtime.execute("CMD_SALE_FINALIZE")
    await Promise.resolve()

    expect(sendCommand).toHaveBeenCalledTimes(1)
    d.resolve(buildSnapshot({ saleState: "COMPLETED" }))
    await Promise.all([p1, p2])
  })

  it("[achado #2] snapshot inválido do backend (saleState fora do enum) gera CommandRejected e lastCommand.status='error', preservando o id — não trava a fila", async () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "PAYMENT_PENDING" }))
    const malformed = buildSnapshot({ saleState: "SALE_ACTIVE" })
    // @ts-expect-error — simula payload malformado do backend (Fase 1 ainda não valida isso no servidor)
    malformed.saleState = "ESTADO_QUE_NAO_EXISTE"
    let call = 0
    const sendCommand: SendCommand = vi.fn(async () => {
      call += 1
      return call === 1 ? malformed : buildSnapshot({ saleState: "COMPLETED" })
    })
    const runtime = createCommandRuntime(machine, sendCommand)

    await expect(runtime.execute("CMD_SALE_FINALIZE")).rejects.toThrow(/saleState desconhecido/)

    const rejected = runtime.getLog().filter((e) => e.type === "CommandRejected")
    expect(rejected).toHaveLength(1)
    expect(rejected[0]!.command).toBe("CMD_SALE_FINALIZE")
    expect(machine.getState().lastCommand?.status).toBe("error")
    expect(machine.getState().lastCommand?.id).toBe(rejected[0]!.id)
    // nenhum CommandAccepted foi logado para um snapshot que não foi de fato aplicado
    expect(runtime.getLog().some((e) => e.type === "CommandAccepted")).toBe(false)

    // fila não trava: uma nova tentativa executa normalmente
    const result = await runtime.execute("CMD_SALE_FINALIZE")
    expect(result.saleState).toBe("COMPLETED")
    expect(machine.getState().lastCommand?.status).toBe("success")
  })

  it("[achado #3] promise que nunca resolve expira por timeout, gera CommandRejected e libera a fila para o próximo comando", async () => {
    vi.useFakeTimers()
    try {
      const machine = createSaleStateMachine(buildSnapshot({ saleState: "SALE_ACTIVE" }))
      const neverResolves = new Promise<PDVViewState>(() => {})
      const sendCommand: SendCommand = vi.fn((command, payload) => {
        if (payload?.codigo === "HUNG") return neverResolves
        return Promise.resolve(buildSnapshot({ saleState: "SALE_ACTIVE" }))
      })
      const runtime = createCommandRuntime(machine, sendCommand, { timeoutMs: 500 })

      const p1 = runtime.execute("CMD_ITEM_SCAN", { codigo: "HUNG" })
      const rejection = expect(p1).rejects.toThrow(/COMMAND_TIMEOUT/)

      await vi.advanceTimersByTimeAsync(500)
      await rejection

      const rejected = runtime.getLog().filter((e) => e.type === "CommandRejected")
      expect(rejected.some((e) => "reason" in e && e.reason.startsWith("COMMAND_TIMEOUT"))).toBe(true)
      expect(machine.getState().lastCommand?.status).toBe("error")

      // fila liberada: um comando seguinte, mesmo emitido depois do timeout, executa normalmente
      const result = await runtime.execute("CMD_ITEM_SCAN", { codigo: "OK" })
      expect(result.saleState).toBe("SALE_ACTIVE")
    } finally {
      vi.useRealTimers()
    }
  })

  it("[achado #3] timeout libera a fila mesmo para um comando já emitido e esperando atrás do que travou (sem retry automático)", async () => {
    vi.useFakeTimers()
    try {
      const machine = createSaleStateMachine(buildSnapshot({ saleState: "SALE_ACTIVE" }))
      const neverResolves = new Promise<PDVViewState>(() => {})
      const sendCommand: SendCommand = vi.fn((command, payload) => {
        if (payload?.codigo === "HUNG") return neverResolves
        return Promise.resolve(buildSnapshot({ saleState: "SALE_ACTIVE" }))
      })
      const runtime = createCommandRuntime(machine, sendCommand, { timeoutMs: 500 })

      const p1 = runtime.execute("CMD_ITEM_SCAN", { codigo: "HUNG" })
      const p2 = runtime.execute("CMD_ITEM_SCAN", { codigo: "OK" })
      const rejection = expect(p1).rejects.toThrow(/COMMAND_TIMEOUT/)

      await vi.advanceTimersByTimeAsync(500)
      await rejection

      const result2 = await p2
      expect(result2.saleState).toBe("SALE_ACTIVE")
      expect(sendCommand).toHaveBeenCalledWith("CMD_ITEM_SCAN", { codigo: "OK" })
      // sem retry automático: sendCommand nunca é chamado de novo para "HUNG"
      expect(sendCommand).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("[achado #4] um comando mais antigo nunca sobrescreve lastCommand depois que um mais novo já registrou status", async () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    const dOld = deferred<PDVViewState>()
    const sendCommand: SendCommand = vi.fn((command, payload) => {
      if (payload?.codigo === "OLD") return dOld.promise
      return Promise.resolve(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    })
    const runtime = createCommandRuntime(machine, sendCommand)

    const p1 = runtime.execute("CMD_ITEM_SCAN", { codigo: "OLD" })
    const p2 = runtime.execute("CMD_ITEM_SCAN", { codigo: "NEW" })
    await Promise.resolve()

    const issued = runtime.getLog().filter((e) => e.type === "CommandIssued")
    expect(issued).toHaveLength(2)
    const idOld = issued[0]!.id
    const idNew = issued[1]!.id
    // logo após emitir os dois, lastCommand reflete o mais recente (NEW), ainda pending
    expect(machine.getState().lastCommand?.id).toBe(idNew)

    // OLD finalmente resolve (depois de NEW já ter "reivindicado" o slot) — não deve reaparecer
    dOld.resolve(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    await p1
    expect(machine.getState().lastCommand?.id).toBe(idNew)
    expect(machine.getState().lastCommand?.id).not.toBe(idOld)

    await p2
    expect(machine.getState().lastCommand?.id).toBe(idNew)
    expect(machine.getState().lastCommand?.status).toBe("success")
  })

  it("[achado #4] a serialização lógica da fila permanece intacta: NEW só chama o backend depois que OLD aplicou seu resultado", async () => {
    const machine = createSaleStateMachine(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    const dOld = deferred<PDVViewState>()
    let newCallStarted = false
    const sendCommand: SendCommand = vi.fn((command, payload) => {
      if (payload?.codigo === "OLD") return dOld.promise
      newCallStarted = true
      return Promise.resolve(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    })
    const runtime = createCommandRuntime(machine, sendCommand)

    const p1 = runtime.execute("CMD_ITEM_SCAN", { codigo: "OLD" })
    const p2 = runtime.execute("CMD_ITEM_SCAN", { codigo: "NEW" })
    await Promise.resolve()

    expect(newCallStarted).toBe(false)
    dOld.resolve(buildSnapshot({ saleState: "SALE_ACTIVE" }))
    await Promise.all([p1, p2])
    expect(newCallStarted).toBe(true)
  })
})
