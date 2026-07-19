import type { DecisionIntelligenceReadModel } from '../read-model/models'

/**
 * Porta do Read Model — carrega Snapshot + Records e projeta.
 * Não contém regras de Decision Intelligence.
 */
export type DecisionReadModelPort = {
  getForLoja(lojaId: string): Promise<DecisionIntelligenceReadModel | null>
}
