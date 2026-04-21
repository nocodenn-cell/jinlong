export interface PdvConfig {
  maxDescontoGerentePercentual: number
  gerenteId: string
}

// Fallback React antes do SQLite/Edge preencherem o cache.
export const defaultPdvConfig: PdvConfig = {
  maxDescontoGerentePercentual: 30,
  gerenteId: 'gerente-local-1',
}
