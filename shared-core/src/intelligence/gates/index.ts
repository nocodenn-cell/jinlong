export type {
  DiDataGate,
  DiGateId,
  DiGateKind,
  DiGateStatus,
  FactConsumptionVerdict,
} from './data-readiness'

export {
  DI_DATA_GATES,
  DI_GATE_IDS,
  evaluateFactConsumption,
  gatesAffectingFact,
  isFactProviderIoAllowed,
  listOpenGates,
} from './data-readiness'
