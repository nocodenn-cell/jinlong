import type { PDVSaleState, PDVViewState } from "./pdvViewState"

/**
 * Payload bruto devolvido por uma RPC/comando, no formato do contrato-alvo
 * da Fase 1 (docs/PDV_FASE1_BACKEND_ALIGNMENT_SPEC.md §4.1): estado final
 * explícito + contexto completo. Mesmo formato de PDVViewState — o nome
 * distinto só marca que este valor ainda não passou pela normalização
 * desta camada.
 */
export type PDVBackendSnapshot = PDVViewState

const VALID_SALE_STATES: readonly PDVSaleState[] = [
  "IDLE",
  "SALE_ACTIVE",
  "PAYMENT_PENDING",
  "PAYMENT_PROCESSING",
  "COMPLETED",
]

/**
 * Única função de interpretação de respostas do backend. Não recalcula
 * nenhum valor de negócio (totais, elegibilidade, preço) — o backend já
 * os resolveu (Fase 1). Só valida a forma e congela o resultado, para que
 * nenhum consumidor React mute o snapshot recebido.
 */
export function interpretBackendSnapshot(snapshot: PDVBackendSnapshot): PDVViewState {
  if (!VALID_SALE_STATES.includes(snapshot.saleState)) {
    throw new Error(`SaleStateMachine: saleState desconhecido recebido do backend: "${String(snapshot.saleState)}"`)
  }
  return Object.freeze({
    ...snapshot,
    items: Object.freeze([...snapshot.items]),
    allowedActions: Object.freeze([...snapshot.allowedActions]),
  }) as PDVViewState
}

export type SaleStateMachine = {
  getState: () => PDVViewState
  /** Compatível com useSyncExternalStore — devolve a função de cancelamento da inscrição. */
  subscribe: (listener: () => void) => () => void
  /** Substitui o estado inteiro pelo snapshot mais recente do backend — nunca faz merge parcial. */
  applySnapshot: (snapshot: PDVBackendSnapshot) => void
}

/**
 * Fonte única de interpretação do backend (roadmap Fase 4). Não cria
 * estado de negócio próprio: cada applySnapshot substitui o estado
 * anterior por inteiro, nunca deriva ou mescla campos.
 */
export function createSaleStateMachine(initial: PDVBackendSnapshot): SaleStateMachine {
  let state = interpretBackendSnapshot(initial)
  const listeners = new Set<() => void>()

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    applySnapshot(snapshot) {
      state = interpretBackendSnapshot(snapshot)
      for (const listener of listeners) listener()
    },
  }
}
