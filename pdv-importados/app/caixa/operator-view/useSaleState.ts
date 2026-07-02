"use client"

import { useCallback, useSyncExternalStore } from "react"
import type { PDVBackendSnapshot, SaleStateMachine } from "./SaleStateMachine"

/**
 * Adapter fornecido pelo chamador (fora do escopo desta fase — a ligação
 * real com RPCs de Fase 1 ainda não existe). O hook não sabe nada sobre
 * Supabase/HTTP; só sabe que um COMMAND vira um novo PDVBackendSnapshot.
 */
export type SendCommand = (command: string, payload?: Record<string, unknown>) => Promise<PDVBackendSnapshot>

/**
 * Único hook de leitura/escrita do estado de venda (roadmap Fase 4).
 * Não usa useState para estado de venda, não infere saleState a partir de
 * múltiplos campos, não recalcula total: só assina o SaleStateMachine via
 * useSyncExternalStore e repassa comandos ao adapter do chamador.
 */
export function useSaleState(machine: SaleStateMachine, sendCommand: SendCommand) {
  const viewState = useSyncExternalStore(machine.subscribe, machine.getState, machine.getState)

  const dispatch = useCallback(
    async (command: string, payload?: Record<string, unknown>) => {
      const snapshot = await sendCommand(command, payload)
      machine.applySnapshot(snapshot)
    },
    [machine, sendCommand],
  )

  return { viewState, dispatch }
}
