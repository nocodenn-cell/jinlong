"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { CommandRuntime } from "./CommandRuntime"

/**
 * Único hook de leitura/escrita do estado de venda (roadmap Fase 4/5).
 * Não usa useState para estado de venda, não infere saleState a partir de
 * múltiplos campos, não recalcula total, não decide retry: só assina o
 * SaleStateMachine (via o CommandRuntime) através de useSyncExternalStore
 * e repassa comandos ao runtime — nunca fala com o backend diretamente.
 */
export function useSaleState(runtime: CommandRuntime) {
  const machine = runtime.getMachine()
  const viewState = useSyncExternalStore(machine.subscribe, machine.getState, machine.getState)

  const dispatch = useCallback(
    (command: string, payload?: Record<string, unknown>, contextId?: string) =>
      runtime.execute(command, payload, contextId),
    [runtime],
  )

  return { viewState, dispatch }
}
