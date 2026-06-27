/**
 * PDV State Machine - Máquina de estados centralizada para o PDV
 *
 * Exportações principais:
 * - PDVState: enum com todos os estados possíveis
 * - usePDVStateMachine: hook que centraliza toda a lógica
 * - usePDVAvailableActions: hook para saber o que é permitido
 * - usePDVActiveShortcuts: hook para saber quais shortcuts estão ativos
 */

export {
  PDVState,
  type PDVSaleContext,
  type PDVStateConfig,
  type PDVStateTransition,
  type PDVStateMachine,
  type CaixaPdvVisibleTabs,
} from "./pdvStateTypes"

export { pdvStateConfigs, getStateConfig } from "./pdvStateConfig"

export {
  pdvTransitions,
  canTransition,
  findTransition,
  getAvailableTransitions,
} from "./pdvTransitions"

export {
  usePDVStateMachine,
  usePDVAvailableActions,
  usePDVActiveShortcuts,
} from "./usePDVStateMachine"
