import {
  WAVE_A_DESCRIPTORS,
  createInMemoryFactProvider,
  type FactProviderPort,
} from '@shared-core/src/intelligence'

/**
 * Providers Wave A vazios — permitem orquestrar o ciclo sem adapters SQL.
 * Não contém regras de negócio; só I/O vazio.
 * Substituir por FactProviders reais de produção (incremental).
 */
export function createEmptyWaveAProviders(): readonly FactProviderPort[] {
  return Object.values(WAVE_A_DESCRIPTORS).map((descriptor) =>
    createInMemoryFactProvider(descriptor, []),
  )
}
