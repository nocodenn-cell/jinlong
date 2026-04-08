export interface PdvConfig {
  gerenteSenhaSha256: string
  maxDescontoGerentePercentual: number
  gerenteId: string
}

/**
 * SHA-256 hex de um segredo interno fixo (migration 005/026 + `public.pdv_config`).
 * Não corresponde a senha digitável comum; serve até existir hash real após sync ou UPDATE no Postgres.
 */
export const PDV_CONFIG_GERENTE_HASH_SENTINEL =
  'b70ce4bad0e8696e32bf9742941625d2579a2fe1b4ec0883374b4268a6435ed1'

// Fallback React antes do SQLite/Edge preencherem o cache.
export const defaultPdvConfig: PdvConfig = {
  gerenteSenhaSha256: PDV_CONFIG_GERENTE_HASH_SENTINEL,
  maxDescontoGerentePercentual: 30,
  gerenteId: 'gerente-local-1',
}
