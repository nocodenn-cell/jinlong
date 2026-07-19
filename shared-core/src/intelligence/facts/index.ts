export type { FactId, FactOwnerDomain, FactReadiness } from './definitions'
export { FACT_IDS } from './definitions'

export { FACT_REGISTRY, getFactEntry, listFactEntries } from './registry'

export type { WaveASupportedFactId, WaveBConditionalFactId } from './wave-plan'
export {
  WAVE_A_DESCRIPTORS,
  WAVE_A_SUPPORTED_FACT_IDS,
  WAVE_B_CONDITIONAL_FACT_IDS,
  WAVE_B_DESCRIPTORS,
  WAVE_CONTEXT_FACT_IDS,
  assertWaveAOnly,
  isWaveASupportedFactId,
} from './wave-plan'
