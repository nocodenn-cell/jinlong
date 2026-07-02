import type { PDVSaleState } from "./pdvViewState"
import type { PDVBackendSnapshot, SaleStateMachine } from "./SaleStateMachine"

/**
 * Adapter fornecido pelo chamador (fora do escopo desta fase — a ligação
 * real com RPCs de Fase 1 ainda não existe). O runtime não sabe nada sobre
 * Supabase/HTTP; só sabe que um COMMAND vira um novo PDVBackendSnapshot.
 * É o único ponto de contato com o backend em toda a árvore — nenhum
 * componente ou hook fora deste módulo recebe uma referência a ele.
 */
export type SendCommand = (command: string, payload?: Record<string, unknown>) => Promise<PDVBackendSnapshot>

export type CommandLogEntry =
  | { type: "CommandIssued"; id: string; command: string; contextId: string; at: number }
  | { type: "CommandAccepted"; id: string; command: string; at: number }
  | { type: "CommandRejected"; id: string; command: string; reason: string; at: number }
  | { type: "StateTransition"; id: string; command: string; from: PDVSaleState; to: PDVSaleState; at: number }

export type CommandRuntime = {
  /**
   * Único ponto de execução de comandos. Serializa (fila lógica — um
   * comando só chama o backend depois que o anterior terminou de ser
   * aplicado ao machine) e deduplica por command+contextId enquanto uma
   * execução equivalente está em voo.
   */
  execute: (command: string, payload?: Record<string, unknown>, contextId?: string) => Promise<PDVBackendSnapshot>
  getMachine: () => SaleStateMachine
  getLog: () => readonly CommandLogEntry[]
}

function deriveContextKey(command: string, payload: Record<string, unknown> | undefined, explicit: string | undefined): string {
  if (explicit) return `${command}:${explicit}`
  if (!payload) return command
  const stable = Object.keys(payload)
    .sort()
    .map((k) => `${k}=${String(payload[k])}`)
    .join("&")
  return `${command}:${stable}`
}

/**
 * Executor único de comandos (roadmap Fase 5). Garante idempotência,
 * rastreabilidade (event log) e serialização — nenhum componente ou hook
 * decide retry ou tenta compensar fluxo; tudo passa por aqui.
 */
export function createCommandRuntime(machine: SaleStateMachine, sendCommand: SendCommand): CommandRuntime {
  const log: CommandLogEntry[] = []
  const pending = new Map<string, Promise<PDVBackendSnapshot>>()
  let tail: Promise<unknown> = Promise.resolve()
  let seq = 0

  function nextId(): string {
    seq += 1
    return `cmd_${seq}_${Date.now()}`
  }

  function execute(
    command: string,
    payload?: Record<string, unknown>,
    contextId?: string,
  ): Promise<PDVBackendSnapshot> {
    const key = deriveContextKey(command, payload, contextId)

    const inFlight = pending.get(key)
    if (inFlight) {
      log.push({ type: "CommandRejected", id: nextId(), command, reason: "duplicate_in_flight", at: Date.now() })
      return inFlight
    }

    const id = nextId()
    log.push({ type: "CommandIssued", id, command, contextId: key, at: Date.now() })
    machine.applySnapshot({ ...machine.getState(), lastCommand: { id, command, status: "pending" } })

    // Fila lógica: o sendCommand deste execute só é chamado depois que o
    // comando anterior terminou de ser aplicado ao machine (não só depois
    // que o backend respondeu) — evita reorder de aplicação de estado.
    const run = tail.then(() => sendCommand(command, payload))

    const settled: Promise<PDVBackendSnapshot> = run.then(
      (snapshot) => {
        const from = machine.getState().saleState
        log.push({ type: "CommandAccepted", id, command, at: Date.now() })
        if (snapshot.saleState !== from) {
          log.push({ type: "StateTransition", id, command, from, to: snapshot.saleState, at: Date.now() })
        }
        machine.applySnapshot({ ...snapshot, lastCommand: { id, command, status: "success" } })
        return snapshot
      },
      (error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error)
        log.push({ type: "CommandRejected", id, command, reason, at: Date.now() })
        machine.applySnapshot({ ...machine.getState(), lastCommand: { id, command, status: "error" } })
        throw error
      },
    )

    tail = settled.catch(() => undefined)

    pending.set(key, settled)
    void settled
      .finally(() => {
        if (pending.get(key) === settled) pending.delete(key)
      })
      .catch(() => undefined)

    return settled
  }

  return { execute, getMachine: () => machine, getLog: () => log }
}
