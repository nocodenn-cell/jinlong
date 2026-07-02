import type { PDVSaleState, PDVViewState } from "./pdvViewState"
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
   * aplicado ao machine) e deduplica por command+contextId — só para
   * comandos naturalmente idempotentes, ou quando o chamador passa um
   * contextId explícito — enquanto uma execução equivalente está em voo.
   */
  execute: (command: string, payload?: Record<string, unknown>, contextId?: string) => Promise<PDVBackendSnapshot>
  getMachine: () => SaleStateMachine
  getLog: () => readonly CommandLogEntry[]
}

export type CommandRuntimeOptions = {
  /**
   * Comandos cuja repetição enquanto uma execução equivalente está em voo
   * deve ser deduplicada (retorna a mesma promise em vez de chamar o
   * backend de novo). Comandos fora deste conjunto SEMPRE executam — dois
   * scans do mesmo código de barras são duas unidades reais, não um
   * "double dispatch" a evitar.
   */
  idempotentCommands?: ReadonlySet<string>
  /** Tempo máximo (ms) que um execute() espera pelo backend antes de expirar. */
  timeoutMs?: number
}

/**
 * Comandos "naturalmente idempotentes": reenviar o mesmo comando enquanto
 * o anterior está em voo não deveria criar um segundo efeito (abrir dois
 * caixas, finalizar a mesma venda duas vezes, cancelar a mesma venda duas
 * vezes). CMD_SALE_CANCEL é reservado para o fluxo de cancelamento pós-venda
 * (docs/PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md §2.8) — nenhum componente desta
 * árvore o emite hoje, mas fica na lista por já ser, por natureza, a mesma
 * classe de comando.
 */
const DEFAULT_IDEMPOTENT_COMMANDS: ReadonlySet<string> = new Set([
  "CMD_SALE_FINALIZE",
  "CMD_CAIXA_ABRIR",
  "CMD_SALE_CANCEL",
])

const DEFAULT_TIMEOUT_MS = 15_000

function stablePayloadKey(payload: Record<string, unknown>): string {
  return Object.keys(payload)
    .sort()
    .map((k) => `${k}=${String(payload[k])}`)
    .join("&")
}

function withTimeout<T>(promise: Promise<T>, ms: number, command: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`COMMAND_TIMEOUT:${command}`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Executor único de comandos (roadmap Fase 5). Garante idempotência,
 * rastreabilidade (event log) e serialização — nenhum componente ou hook
 * decide retry ou tenta compensar fluxo; tudo passa por aqui.
 */
export function createCommandRuntime(
  machine: SaleStateMachine,
  sendCommand: SendCommand,
  options?: CommandRuntimeOptions,
): CommandRuntime {
  const idempotentCommands = options?.idempotentCommands ?? DEFAULT_IDEMPOTENT_COMMANDS
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const log: CommandLogEntry[] = []
  const pending = new Map<string, Promise<PDVBackendSnapshot>>()
  let tail: Promise<unknown> = Promise.resolve()
  let seq = 0
  /** Maior seq que já escreveu em lastCommand — um comando mais antigo nunca sobrescreve um mais recente. */
  let lastCommandSeq = 0

  function nextSeq(): number {
    seq += 1
    return seq
  }

  function idFor(commandSeq: number): string {
    return `cmd_${commandSeq}_${Date.now()}`
  }

  function deriveContextKey(
    command: string,
    payload: Record<string, unknown> | undefined,
    explicit: string | undefined,
    commandSeq: number,
  ): string {
    if (explicit) return `${command}:${explicit}`
    if (!idempotentCommands.has(command)) {
      // Fora do conjunto idempotente: cada chamada é sempre única — nunca deduplicada.
      return `${command}:__seq_${commandSeq}`
    }
    if (!payload) return command
    return `${command}:${stablePayloadKey(payload)}`
  }

  /**
   * Único ponto de escrita de lastCommand. Um comando mais antigo (seq
   * menor) nunca sobrescreve o que um comando mais novo já registrou —
   * devolve o lastCommand atual sem mudar nada nesse caso. Não afeta o
   * resto do snapshot: o estado de negócio (saleState/items/total) sempre
   * é aplicado normalmente pelo chamador, só o campo lastCommand é guardado.
   */
  function guardedLastCommand(
    commandSeq: number,
    overlay: NonNullable<PDVViewState["lastCommand"]>,
  ): PDVViewState["lastCommand"] {
    if (commandSeq < lastCommandSeq) return machine.getState().lastCommand
    lastCommandSeq = commandSeq
    return overlay
  }

  function fail(id: string, commandSeq: number, command: string, error: unknown): never {
    const reason = error instanceof Error ? error.message : String(error)
    log.push({ type: "CommandRejected", id, command, reason, at: Date.now() })
    machine.applySnapshot({
      ...machine.getState(),
      lastCommand: guardedLastCommand(commandSeq, { id, command, status: "error" }),
    })
    throw error
  }

  function execute(
    command: string,
    payload?: Record<string, unknown>,
    contextId?: string,
  ): Promise<PDVBackendSnapshot> {
    const commandSeq = nextSeq()
    const key = deriveContextKey(command, payload, contextId, commandSeq)

    const inFlight = pending.get(key)
    if (inFlight) {
      log.push({ type: "CommandRejected", id: idFor(commandSeq), command, reason: "duplicate_in_flight", at: Date.now() })
      return inFlight
    }

    const id = idFor(commandSeq)
    log.push({ type: "CommandIssued", id, command, contextId: key, at: Date.now() })
    machine.applySnapshot({
      ...machine.getState(),
      lastCommand: guardedLastCommand(commandSeq, { id, command, status: "pending" }),
    })

    // Fila lógica: o sendCommand deste execute só é chamado depois que o
    // comando anterior terminou de ser aplicado ao machine (não só depois
    // que o backend respondeu) — evita reorder de aplicação de estado. O
    // timeout corre a partir da vez deste comando na fila, não do instante
    // de emissão — um comando parado atrás de outro lento não expira antes
    // de sua vez chegar.
    const run = tail.then(() => withTimeout(sendCommand(command, payload), timeoutMs, command))

    const settled: Promise<PDVBackendSnapshot> = run.then(
      (snapshot) => {
        // Validação/aplicação primeiro: se machine.applySnapshot lançar (ex.:
        // saleState fora do enum), cai no catch e segue o mesmo caminho de
        // falha do backend — nunca perde rastreabilidade nem loga sucesso
        // para algo que não foi de fato aplicado.
        try {
          const from = machine.getState().saleState
          machine.applySnapshot({
            ...snapshot,
            lastCommand: guardedLastCommand(commandSeq, { id, command, status: "success" }),
          })
          log.push({ type: "CommandAccepted", id, command, at: Date.now() })
          if (snapshot.saleState !== from) {
            log.push({ type: "StateTransition", id, command, from, to: snapshot.saleState, at: Date.now() })
          }
          return snapshot
        } catch (error) {
          return fail(id, commandSeq, command, error)
        }
      },
      (error: unknown) => fail(id, commandSeq, command, error),
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
