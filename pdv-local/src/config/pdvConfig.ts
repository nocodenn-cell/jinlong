import { DEFAULT_MAX_DESCONTO_GERENTE_PERCENTUAL } from '@core/managerDiscount/policy'

export interface PdvConfig {
  maxDescontoGerentePercentual: number
  gerenteId: string
}

// Fallback React antes do SQLite/Edge preencherem o cache.
// Mantido alinhado com o teto autoritativo da Edge `validar-gerente`
// e com a `pdv_config.max_desconto_gerente_percentual`.
export const defaultPdvConfig: PdvConfig = {
  maxDescontoGerentePercentual: DEFAULT_MAX_DESCONTO_GERENTE_PERCENTUAL,
  gerenteId: 'gerente-local-1',
}
